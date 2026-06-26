use std::collections::BTreeSet;

mod manifest;
mod native_renderer;

pub use manifest::{
    load_native_target_bundle_manifest, NativeStartupError, NativeStartupManifestExpectation,
    NativeStartupValidation, NativeTargetBundleManifest, TargetBundleNativeRendererInfo,
    TargetBundleReference,
};
#[cfg(test)]
pub use manifest::{
    RuntimePackageRecord, TargetBundleAppInfo, TargetBundleProjectGraphRecord,
    TargetBundleReferenceObject,
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

fn check_selected_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let selected: BTreeSet<String> = manifest
        .selected_core_adapters
        .iter()
        .flat_map(TargetBundleReference::specifiers)
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
        let package_name = reference
            .specifier()
            .map(normalize_package_specifier)
            .unwrap_or_else(|| "unknown".to_string());
        let message = match runtime_package_id {
            Some(package_id) => format!(
                "Runtime package \"{}\" renderer entry \"{}\" must declare target \"native\".",
                package_id, package_name
            ),
            None => format!(
                "Renderer entry \"{}\" must declare target \"native\".",
                package_name
            ),
        };
        diagnostics.push(message);
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
            .flat_map(TargetBundleReference::specifiers)
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
            .flat_map(TargetBundleReference::specifiers)
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

fn check_project_graph_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for project_graph in &manifest.project_graphs {
        for package_name in project_graph
            .references
            .iter()
            .flat_map(TargetBundleReference::specifiers)
            .map(normalize_package_specifier)
        {
            let Some(package_core_family) = target_core_plugin_family(&package_name) else {
                continue;
            };

            if project_graph.kind == "post-bundle" && package_core_family == "native-core" {
                continue;
            }

            if project_graph.kind == "post-bundle" {
                diagnostics.push(format!(
                    "Post-bundle project graph \"{}\" for native target must not include inactive target core adapter \"{}\" from \"{}\".",
                    project_graph.id, package_name, package_core_family
                ));
            } else {
                diagnostics.push(format!(
                    "Project graph \"{}\" ({}) for native target must not declare target core adapter \"{}\" from \"{}\". Target core wiring belongs only in the native target-core resolver.",
                    project_graph.id, project_graph.kind, package_name, package_core_family
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

    for project_graph in &manifest.project_graphs {
        collect_package_names(&project_graph.references, &mut package_names);
    }

    package_names.into_iter().collect()
}

fn collect_package_names(
    references: &[TargetBundleReference],
    package_names: &mut BTreeSet<String>,
) {
    for reference in references {
        for package_name in reference
            .specifiers()
            .into_iter()
            .map(normalize_package_specifier)
        {
            package_names.insert(package_name);
        }
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
    let normalized = strip_reference_suffix(
        specifier
            .trim()
            .trim_start_matches('\0')
            .replace('\\', "/")
            .as_str(),
    );
    if let Some(package_root) = package_root_from_dependency_path(&normalized) {
        return package_root;
    }

    let package_specifier = normalized
        .strip_prefix("npm:")
        .unwrap_or(normalized.as_str());

    if !package_specifier.starts_with('@') {
        let path_root = package_specifier
            .split('/')
            .next()
            .unwrap_or(package_specifier);
        return path_root
            .split("::")
            .next()
            .unwrap_or(path_root)
            .to_string();
    }

    let mut parts = package_specifier.split('/');
    match (parts.next(), parts.next()) {
        (Some(scope), Some(package_name)) => format!("{scope}/{package_name}"),
        _ => package_specifier.to_string(),
    }
}

fn strip_reference_suffix(specifier: &str) -> String {
    let query_index = specifier.find('?');
    let hash_index = specifier.find('#');
    let suffix_index = match (query_index, hash_index) {
        (Some(query), Some(hash)) => Some(query.min(hash)),
        (Some(query), None) => Some(query),
        (None, Some(hash)) => Some(hash),
        (None, None) => None,
    };
    suffix_index
        .map(|index| specifier[..index].to_string())
        .unwrap_or_else(|| specifier.to_string())
}

fn package_root_from_dependency_path(specifier: &str) -> Option<String> {
    let segments: Vec<&str> = specifier
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    for index in (0..segments.len()).rev() {
        if segments[index] != "node_modules" {
            continue;
        }

        if segments.get(index + 1) == Some(&".pnpm") {
            if let Some(package_root) =
                package_root_from_pnpm_segment(segments.get(index + 2).copied())
            {
                return Some(package_root);
            }
        }

        return package_root_from_path_segments(&segments, index + 1);
    }

    if let Some(index) = segments.iter().rposition(|segment| *segment == ".pnpm") {
        return package_root_from_pnpm_segment(segments.get(index + 1).copied());
    }

    None
}

fn package_root_from_path_segments(segments: &[&str], start_index: usize) -> Option<String> {
    let first = segments.get(start_index)?;
    if first.starts_with('@') {
        let second = segments.get(start_index + 1)?;
        return Some(format!("{first}/{second}"));
    }

    Some(first.split("::").next().unwrap_or(first).to_string())
}

fn package_root_from_pnpm_segment(segment: Option<&str>) -> Option<String> {
    let segment = segment?;
    if segment.starts_with('@') {
        let without_scope = &segment[1..];
        let plus_index = without_scope.find('+')?;
        let scoped_name = &without_scope[..plus_index];
        let rest = &without_scope[plus_index + 1..];
        let version_index = rest.find('@')?;
        let package_name = &rest[..version_index];
        return Some(format!("@{scoped_name}/{package_name}"));
    }

    let version_index = segment.find('@')?;
    Some(segment[..version_index].to_string())
}

#[cfg(test)]
pub(crate) mod tests;
