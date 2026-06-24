use std::fmt::{Display, Formatter};
use std::path::Path;

use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTargetBundleManifest {
    pub target: String,
    pub profile: String,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub app: Option<TargetBundleAppInfo>,
    #[serde(default)]
    pub native_renderer: Option<TargetBundleNativeRendererInfo>,
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
pub struct TargetBundleAppInfo {
    #[serde(default)]
    pub bundle_id: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub build_number: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetBundleNativeRendererInfo {
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub backend: Option<String>,
    #[serde(default)]
    pub backend_version: Option<String>,
    #[serde(default)]
    pub capability_ids: Vec<String>,
    #[serde(default)]
    pub capability_manifest_hash: Option<String>,
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
    pub(super) fn specifier(&self) -> Option<&str> {
        match self {
            Self::Specifier(specifier) => Some(specifier.as_str()),
            Self::Object(reference) => reference
                .package_name
                .as_deref()
                .or(reference.specifier.as_deref()),
        }
    }

    pub(super) fn target(&self) -> Option<&str> {
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
pub struct NativeStartupManifestExpectation {
    pub bundle_id: String,
    pub version: String,
    pub build_number: String,
    pub profile: String,
    pub platform: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeStartupError {
    diagnostics: Vec<String>,
}

impl NativeStartupError {
    pub(super) fn new(diagnostics: Vec<String>) -> Self {
        Self { diagnostics }
    }

    fn io(path: &Path, error: std::io::Error) -> Self {
        Self::new(vec![format!(
            "Failed to read native target bundle manifest \"{}\": {}.",
            path.display(),
            error
        )])
    }

    fn json(path: &Path, error: serde_json::Error) -> Self {
        Self::new(vec![format!(
            "Failed to parse native target bundle manifest \"{}\": {}.",
            path.display(),
            error
        )])
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

pub fn load_native_target_bundle_manifest(
    path: impl AsRef<Path>,
) -> Result<NativeTargetBundleManifest, NativeStartupError> {
    let path = path.as_ref();
    let json =
        std::fs::read_to_string(path).map_err(|error| NativeStartupError::io(path, error))?;
    serde_json::from_str(&json).map_err(|error| NativeStartupError::json(path, error))
}
