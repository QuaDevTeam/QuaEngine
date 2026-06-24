use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};

use serde::Deserialize;

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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTargetBundleManifest {
    pub target: String,
    pub selected_core_plugin_family: String,
    #[serde(default)]
    pub selected_core_adapters: Vec<TargetBundleReference>,
    #[serde(default)]
    pub dependencies: Vec<TargetBundleReference>,
    #[serde(default)]
    pub renderer_entries: Vec<TargetBundleReference>,
    #[serde(default)]
    pub runtime_packages: Vec<RuntimePackageRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePackageRecord {
    pub id: String,
    #[serde(default)]
    pub executable_dependencies: Vec<TargetBundleReference>,
    #[serde(default)]
    pub renderer_entries: Vec<TargetBundleReference>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum TargetBundleReference {
    Specifier(String),
    Object(TargetBundleReferenceObject),
}

impl TargetBundleReference {
    fn specifier(&self) -> Option<&str> {
        match self {
            Self::Specifier(specifier) => Some(specifier.as_str()),
            Self::Object(reference) => reference
                .package_name
                .as_deref()
                .or(reference.specifier.as_deref()),
        }
    }

    fn target(&self) -> Option<&str> {
        match self {
            Self::Specifier(_) => None,
            Self::Object(reference) => reference.target.as_deref(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetBundleReferenceObject {
    #[serde(default)]
    pub specifier: Option<String>,
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub plugin_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeStartupValidation {
    pub package_names: Vec<String>,
    pub selected_targets: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeStartupError {
    diagnostics: Vec<String>,
}

impl NativeStartupError {
    fn new(diagnostics: Vec<String>) -> Self {
        Self { diagnostics }
    }

    pub fn diagnostics(&self) -> &[String] {
        &self.diagnostics
    }
}

impl Display for NativeStartupError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native startup target bundle validation failed. {}",
            self.diagnostics.join(" ")
        )
    }
}

impl std::error::Error for NativeStartupError {}

pub fn validate_native_target_bundle_manifest(
    manifest: &NativeTargetBundleManifest,
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
