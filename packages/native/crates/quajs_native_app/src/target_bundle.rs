mod manifest;
mod native_renderer;
mod target_core;

pub use manifest::{
    load_native_target_bundle_manifest, NativeStartupError, NativeStartupManifestExpectation,
    NativeStartupValidation, NativeTargetBundleManifest, TargetBundleNativeRendererInfo,
};
#[cfg(test)]
pub use manifest::{
    RuntimePackageRecord, TargetBundleAppInfo, TargetBundleProjectGraphRecord,
    TargetBundleReference, TargetBundleReferenceObject,
};
use native_renderer::check_native_renderer_info;
#[cfg(test)]
pub use target_core::NATIVE_CORE_ADAPTERS;
use target_core::{
    check_exclusive_native_bootstrap, check_foreign_target_roots,
    check_project_graph_core_adapters, check_renderer_entry_targets,
    check_runtime_package_core_adapters, check_selected_core_adapters,
    collect_target_bundle_package_names, selected_target_bootstraps,
};

pub fn validate_native_target_bundle_manifest(
    manifest: &NativeTargetBundleManifest,
    expectation: Option<&NativeStartupManifestExpectation>,
) -> Result<NativeStartupValidation, NativeStartupError> {
    let package_names = collect_target_bundle_package_names(manifest);
    let selected_targets = selected_target_bootstraps(&package_names);
    let mut diagnostics = Vec::new();

    if manifest.target != "native" {
        diagnostics.push(format!(
            "Native app startup expected target \"native\", but manifest target is \"{}\".",
            manifest.target
        ));
    }

    if manifest.selected_core_plugin_family != "native-core" {
        diagnostics.push(format!(
            "Native app startup expected selectedCorePluginFamily \"native-core\", but manifest selected \"{}\".",
            manifest.selected_core_plugin_family
        ));
    }

    check_target_core_resolver(manifest, &mut diagnostics);
    check_native_artifact_metadata(manifest, &mut diagnostics);
    check_required_app_metadata(manifest, &mut diagnostics);

    if let Some(expectation) = expectation {
        check_manifest_identity(manifest, expectation, &mut diagnostics);
    }

    check_native_renderer_info(manifest, &mut diagnostics);
    check_selected_core_adapters(manifest, &mut diagnostics);
    check_exclusive_native_bootstrap(&selected_targets, &mut diagnostics);
    check_foreign_target_roots(&package_names, &mut diagnostics);
    check_renderer_entry_targets(manifest, &mut diagnostics);
    check_runtime_package_core_adapters(manifest, &mut diagnostics);
    check_project_graph_core_adapters(manifest, &mut diagnostics);

    if diagnostics.is_empty() {
        Ok(NativeStartupValidation {
            package_names,
            selected_targets,
        })
    } else {
        Err(NativeStartupError::new(diagnostics))
    }
}

fn check_target_core_resolver(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    match manifest.target_core_resolver.as_deref() {
        Some("native-core-resolver") => {}
        Some(resolver) => diagnostics.push(format!(
            "Native app startup expected targetCoreResolver \"native-core-resolver\", but manifest was produced by \"{}\".",
            resolver
        )),
        None => diagnostics.push(
            "Native target bundle manifest must include targetCoreResolver \"native-core-resolver\"."
                .to_string(),
        ),
    }
}

fn check_native_artifact_metadata(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    if manifest.profile != "debug" && manifest.profile != "release" {
        diagnostics.push(format!(
            "Native target bundle manifest profile must be \"debug\" or \"release\", but found \"{}\".",
            manifest.profile
        ));
    }

    match manifest.platform.as_deref() {
        Some(platform) if platform.trim().is_empty() => diagnostics
            .push("Native target bundle manifest platform must not be empty.".to_string()),
        Some("macos" | "windows" | "linux") => {}
        Some(platform) => diagnostics.push(format!(
            "Native target bundle manifest platform must be \"macos\", \"windows\", or \"linux\", but found \"{}\".",
            platform
        )),
        None => diagnostics.push("Native target bundle manifest must include platform.".to_string()),
    }
}

fn check_required_app_metadata(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let Some(app) = manifest.app.as_ref() else {
        diagnostics.push("Native target bundle manifest must include app metadata.".to_string());
        return;
    };

    check_required_app_field("bundleId", app.bundle_id.as_deref(), diagnostics);
    check_required_app_field("version", app.version.as_deref(), diagnostics);
    check_required_app_field("buildNumber", app.build_number.as_deref(), diagnostics);
    check_required_app_field("icon", app.icon.as_deref(), diagnostics);
}

fn check_required_app_field(field: &str, actual: Option<&str>, diagnostics: &mut Vec<String>) {
    match actual {
        Some(actual) if !actual.trim().is_empty() => {}
        Some(_) => diagnostics.push(format!(
            "Native target bundle manifest app.{field} must not be empty."
        )),
        None => diagnostics.push(format!(
            "Native target bundle manifest must include app.{field}."
        )),
    }
}

fn check_manifest_identity(
    manifest: &NativeTargetBundleManifest,
    expectation: &NativeStartupManifestExpectation,
    diagnostics: &mut Vec<String>,
) {
    if manifest.profile != expectation.profile {
        diagnostics.push(format!(
            "Native app startup expected manifest profile \"{}\", but manifest profile is \"{}\".",
            expectation.profile, manifest.profile
        ));
    }

    match manifest.platform.as_deref() {
        Some(platform) if platform == expectation.platform => {}
        Some(platform) => diagnostics.push(format!(
            "Native app startup expected manifest platform \"{}\", but manifest platform is \"{}\".",
            expectation.platform, platform
        )),
        None => diagnostics.push(format!(
            "Native app startup expected manifest platform \"{}\", but manifest omitted platform.",
            expectation.platform
        )),
    }

    let Some(app) = manifest.app.as_ref() else {
        diagnostics.push("Native target bundle manifest must include app metadata.".to_string());
        return;
    };

    check_optional_metadata(
        "bundleId",
        app.bundle_id.as_deref(),
        expectation.bundle_id.as_str(),
        diagnostics,
    );
    check_optional_metadata(
        "version",
        app.version.as_deref(),
        expectation.version.as_str(),
        diagnostics,
    );
    check_optional_metadata(
        "buildNumber",
        app.build_number.as_deref(),
        expectation.build_number.as_str(),
        diagnostics,
    );
    check_required_app_icon(app.icon.as_deref(), diagnostics);
}

fn check_optional_metadata(
    field: &str,
    actual: Option<&str>,
    expected: &str,
    diagnostics: &mut Vec<String>,
) {
    match actual {
        Some(actual) if actual == expected => {}
        Some(actual) => diagnostics.push(format!(
            "Native target bundle manifest app.{field} expected \"{expected}\", but found \"{actual}\"."
        )),
        None => diagnostics.push(format!(
            "Native target bundle manifest must include app.{field} \"{expected}\"."
        )),
    }
}

fn check_required_app_icon(actual: Option<&str>, diagnostics: &mut Vec<String>) {
    match actual {
        Some(actual) if !actual.trim().is_empty() => {}
        Some(_) => diagnostics
            .push("Native target bundle manifest app.icon must not be empty.".to_string()),
        None => {
            diagnostics.push("Native target bundle manifest must include app.icon.".to_string())
        }
    }
}

#[cfg(test)]
pub(crate) mod tests;
