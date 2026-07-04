use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NativePlatform {
    #[serde(rename = "macos")]
    MacOs,
    #[serde(rename = "windows")]
    Windows,
    #[serde(rename = "linux")]
    Linux,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NativeProfile {
    Debug,
    Release,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAppInfo {
    pub name: String,
    pub bundle_id: String,
    pub version: String,
    pub build_number: String,
    pub profile: NativeProfile,
    pub platform: NativePlatform,
    pub arch: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererCapability {
    pub id: String,
    pub target: String,
    pub version: String,
    pub owner_package: String,
    pub projection_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub intent_events: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub asset_kinds: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub qss_features: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub qui_components: Vec<String>,
    pub fallback: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererInfo {
    pub package_name: String,
    pub version: String,
    pub backend: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend_version: Option<String>,
    pub capability_manifest_hash: String,
    pub capabilities: Vec<RendererCapability>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeInfo {
    pub quickjs_version: String,
    pub native_runtime_version: String,
    pub asset_adapter_version: String,
    pub store_adapter_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostInfo {
    pub app: NativeAppInfo,
    pub renderer: NativeRendererInfo,
    pub runtime: NativeRuntimeInfo,
}

impl NativeHostInfo {
    pub fn renderer_version(&self) -> &str {
        &self.renderer.version
    }

    pub fn has_capability(&self, capability_id: &str) -> bool {
        self.renderer
            .capabilities
            .iter()
            .any(|capability| capability.id == capability_id)
    }
}
