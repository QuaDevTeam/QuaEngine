use std::collections::BTreeSet;

mod manifest;
mod native_renderer;

pub use manifest::{
    load_native_target_bundle_manifest, NativeStartupError, NativeStartupManifestExpectation,
    NativeStartupValidation, NativeTargetBundleManifest, RuntimePackageRecord, TargetBundleAppInfo,
    TargetBundleNativeRendererInfo, TargetBundleReference, TargetBundleReferenceObject,
};
use native_renderer::check_native_renderer_info;

const WEB_CORE_ADAPTERS: &[&str] = &["@quajs/assets-web", "@quajs/renderer-web"];
const COCOS_CORE_ADAPTERS: &[&str] = &[
    "@quajs/cocos-host",
    "@quajs/assets-cocos",
    "@quajs/renderer-cocos",
];
pub const NATIVE_CORE_ADAPTERS: &[&str] = &[
    "@quajs/engine-native",
    "@quajs/assets-native",
    "@quajs/store-native",
    "@quajs/native-contracts",
];

const WEB_CORE_ROOTS: &[&str] = &[
    "@quajs/assets-web",
    "@quajs/store-web",
    "@quajs/renderer-web",
    "@quajs/renderer-vue",
    "@quajs/renderer-react",
    "@quajs/renderer-svelte",
];
const COCOS_CORE_ROOTS: &[&str] = &[
    "@quajs/cocos-host",
    "@quajs/assets-cocos",
    "@quajs/store-cocos",
    "@quajs/renderer-cocos",
];
const NATIVE_CORE_ROOTS: &[&str] = &[
    "@quajs/engine-native",
    "@quajs/assets-native",
    "@quajs/store-native",
    "@quajs/native-contracts",
    "quajs_native_runtime",
    "quajs_wgpu_renderer",
    "quajs_native_app",
];

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

    if let Some(expectation) = expectation {
        check_manifest_identity(manifest, expectation, &mut diagnostics);
    }

    check_native_renderer_info(manifest, &mut diagnostics);
    check_selected_core_adapters(manifest, &mut diagnostics);
    check_exclusive_native_bootstrap(&selected_targets, &mut diagnostics);
    check_foreign_target_roots(&package_names, &mut diagnostics);
    check_renderer_entry_targets(manifest, &mut diagnostics);
    check_runtime_package_core_adapters(manifest, &mut diagnostics);

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

fn check_selected_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let selected: BTreeSet<String> = manifest
        .selected_core_adapters
        .iter()
        .filter_map(TargetBundleReference::specifier)
        .map(normalize_package_specifier)
        .collect();
    let expected: BTreeSet<String> = NATIVE_CORE_ADAPTERS
        .iter()
        .map(|specifier| (*specifier).to_string())
        .collect();

    for package_name in expected.difference(&selected) {
        diagnostics.push(format!(
            "Native target bundle is missing required core adapter \"{}\".",
            package_name
        ));
    }

    for package_name in selected.difference(&expected) {
        diagnostics.push(format!(
            "Native target bundle selected unexpected core adapter \"{}\".",
            package_name
        ));
    }
}

fn check_exclusive_native_bootstrap(
    selected_targets: &[&'static str],
    diagnostics: &mut Vec<String>,
) {
    if selected_targets.is_empty() {
        diagnostics.push("Native app startup found no target bootstrap core adapter.".to_string());
    } else if selected_targets != ["native"] {
        diagnostics.push(format!(
            "Native app startup package graph mixes target bootstrap core adapters for {}.",
            selected_targets.join(", ")
        ));
    }
}

fn check_foreign_target_roots(package_names: &[String], diagnostics: &mut Vec<String>) {
    for package_name in package_names {
        match target_core_plugin_family(package_name) {
            Some("web-core") | Some("cocos-core") => diagnostics.push(format!(
                "Native target bundle must not include foreign target core adapter \"{}\".",
                package_name
            )),
            _ => {}
        }
    }
}

fn check_renderer_entry_targets(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for reference in &manifest.renderer_entries {
        push_renderer_entry_target_diagnostic(reference, None, diagnostics);
    }

    for runtime_package in &manifest.runtime_packages {
        for reference in &runtime_package.renderer_entries {
            push_renderer_entry_target_diagnostic(
                reference,
                Some(&runtime_package.id),
                diagnostics,
            );
        }
    }
}

fn push_renderer_entry_target_diagnostic(
    reference: &TargetBundleReference,
    runtime_package_id: Option<&str>,
    diagnostics: &mut Vec<String>,
) {
    let Some(target) = reference.target() else {
        return;
    };
    if target == "native" {
        return;
    }

    let package_name = reference
        .specifier()
        .map(normalize_package_specifier)
        .unwrap_or_else(|| "unknown".to_string());
    let message = match runtime_package_id {
        Some(package_id) => format!(
            "Runtime package \"{}\" declares renderer entry \"{}\" for target \"{}\", but native startup only accepts target \"native\".",
            package_id, package_name, target
        ),
        None => format!(
            "Renderer entry \"{}\" declares target \"{}\", but native startup only accepts target \"native\".",
            package_name, target
        ),
    };
    diagnostics.push(message);
}

fn check_runtime_package_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for runtime_package in &manifest.runtime_packages {
        for package_name in runtime_package
            .executable_dependencies
            .iter()
            .filter_map(TargetBundleReference::specifier)
            .map(normalize_package_specifier)
        {
            if is_target_core_adapter_root(&package_name) {
                diagnostics.push(format!(
                    "Runtime package \"{}\" must not include target core adapter \"{}\" through executableDependencies.",
                    runtime_package.id, package_name
                ));
            }
        }

        for package_name in runtime_package
            .renderer_entries
            .iter()
            .filter_map(TargetBundleReference::specifier)
            .map(normalize_package_specifier)
        {
            if is_target_core_adapter_root(&package_name) {
                diagnostics.push(format!(
                    "Runtime package \"{}\" must not include target core adapter \"{}\" through rendererEntries.",
                    runtime_package.id, package_name
                ));
            }
        }
    }
}

fn collect_target_bundle_package_names(manifest: &NativeTargetBundleManifest) -> Vec<String> {
    let mut package_names = BTreeSet::new();

    collect_package_names(&manifest.selected_core_adapters, &mut package_names);
    collect_package_names(&manifest.dependencies, &mut package_names);
    collect_package_names(&manifest.renderer_entries, &mut package_names);

    for runtime_package in &manifest.runtime_packages {
        collect_package_names(&runtime_package.executable_dependencies, &mut package_names);
        collect_package_names(&runtime_package.renderer_entries, &mut package_names);
    }

    package_names.into_iter().collect()
}

fn collect_package_names(
    references: &[TargetBundleReference],
    package_names: &mut BTreeSet<String>,
) {
    for package_name in references
        .iter()
        .filter_map(TargetBundleReference::specifier)
        .map(normalize_package_specifier)
    {
        package_names.insert(package_name);
    }
}

fn selected_target_bootstraps(package_names: &[String]) -> Vec<&'static str> {
    let mut selected = Vec::new();

    if has_any_root(package_names, WEB_CORE_ADAPTERS) {
        selected.push("web");
    }
    if has_any_root(package_names, COCOS_CORE_ADAPTERS) {
        selected.push("cocos");
    }
    if has_any_root(package_names, NATIVE_CORE_ADAPTERS) {
        selected.push("native");
    }

    selected
}

fn has_any_root(package_names: &[String], roots: &[&str]) -> bool {
    package_names
        .iter()
        .any(|package_name| roots.iter().any(|root| package_name == root))
}

fn target_core_plugin_family(package_name: &str) -> Option<&'static str> {
    if WEB_CORE_ROOTS.contains(&package_name) {
        Some("web-core")
    } else if COCOS_CORE_ROOTS.contains(&package_name) {
        Some("cocos-core")
    } else if NATIVE_CORE_ROOTS.contains(&package_name) {
        Some("native-core")
    } else {
        None
    }
}

fn is_target_core_adapter_root(package_name: &str) -> bool {
    target_core_plugin_family(package_name).is_some()
}

fn normalize_package_specifier(specifier: &str) -> String {
    if !specifier.starts_with('@') {
        let path_root = specifier.split('/').next().unwrap_or(specifier);
        return path_root
            .split("::")
            .next()
            .unwrap_or(path_root)
            .to_string();
    }

    let mut parts = specifier.split('/');
    match (parts.next(), parts.next()) {
        (Some(scope), Some(package_name)) => format!("{scope}/{package_name}"),
        _ => specifier.to_string(),
    }
}

#[cfg(test)]
pub(crate) mod tests;
