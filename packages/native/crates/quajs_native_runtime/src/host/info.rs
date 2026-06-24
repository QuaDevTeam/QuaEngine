use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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

pub fn capability_manifest_hash(capabilities: &[RendererCapability]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(stable_capability_manifest_payload(capabilities).as_bytes());
    format!("sha256:{}", hex_lower(&hasher.finalize()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeHostInfoBuilder {
    app_name: String,
    bundle_id: String,
    app_version: String,
    build_number: String,
    profile: NativeProfile,
    platform: NativePlatform,
    arch: String,
    renderer_version: String,
    backend_version: Option<String>,
    quickjs_version: String,
    native_runtime_version: String,
    asset_adapter_version: String,
    store_adapter_version: String,
    capabilities: Vec<RendererCapability>,
}

impl NativeHostInfoBuilder {
    pub fn new(app_name: impl Into<String>, bundle_id: impl Into<String>) -> Self {
        let package_version = env!("CARGO_PKG_VERSION").to_string();
        Self {
            app_name: app_name.into(),
            bundle_id: bundle_id.into(),
            app_version: package_version.clone(),
            build_number: "dev".to_string(),
            profile: current_profile(),
            platform: current_platform(),
            arch: std::env::consts::ARCH.to_string(),
            renderer_version: package_version.clone(),
            backend_version: None,
            quickjs_version: "pending".to_string(),
            native_runtime_version: package_version.clone(),
            asset_adapter_version: package_version.clone(),
            store_adapter_version: package_version,
            capabilities: Vec::new(),
        }
    }

    pub fn app_version(mut self, version: impl Into<String>) -> Self {
        self.app_version = version.into();
        self
    }

    pub fn build_number(mut self, build_number: impl Into<String>) -> Self {
        self.build_number = build_number.into();
        self
    }

    pub fn profile(mut self, profile: NativeProfile) -> Self {
        self.profile = profile;
        self
    }

    pub fn platform(mut self, platform: NativePlatform) -> Self {
        self.platform = platform;
        self
    }

    pub fn arch(mut self, arch: impl Into<String>) -> Self {
        self.arch = arch.into();
        self
    }

    pub fn renderer_version(mut self, version: impl Into<String>) -> Self {
        self.renderer_version = version.into();
        self
    }

    pub fn backend_version(mut self, version: Option<impl Into<String>>) -> Self {
        self.backend_version = version.map(Into::into);
        self
    }

    pub fn quickjs_version(mut self, version: impl Into<String>) -> Self {
        self.quickjs_version = version.into();
        self
    }

    pub fn native_runtime_version(mut self, version: impl Into<String>) -> Self {
        self.native_runtime_version = version.into();
        self
    }

    pub fn asset_adapter_version(mut self, version: impl Into<String>) -> Self {
        self.asset_adapter_version = version.into();
        self
    }

    pub fn store_adapter_version(mut self, version: impl Into<String>) -> Self {
        self.store_adapter_version = version.into();
        self
    }

    pub fn capabilities(mut self, capabilities: Vec<RendererCapability>) -> Self {
        self.capabilities = capabilities;
        self
    }

    pub fn build(self) -> NativeHostInfo {
        NativeHostInfo {
            app: NativeAppInfo {
                name: self.app_name,
                bundle_id: self.bundle_id,
                version: self.app_version,
                build_number: self.build_number,
                profile: self.profile,
                platform: self.platform,
                arch: self.arch,
            },
            renderer: NativeRendererInfo {
                package_name: "@quajs/native-renderer".to_string(),
                version: self.renderer_version,
                backend: "wgpu".to_string(),
                backend_version: self.backend_version,
                capability_manifest_hash: capability_manifest_hash(&self.capabilities),
                capabilities: self.capabilities,
            },
            runtime: NativeRuntimeInfo {
                quickjs_version: self.quickjs_version,
                native_runtime_version: self.native_runtime_version,
                asset_adapter_version: self.asset_adapter_version,
                store_adapter_version: self.store_adapter_version,
            },
        }
    }
}

fn stable_capability_manifest_payload(capabilities: &[RendererCapability]) -> String {
    let mut payload = String::from("[");
    for (index, capability) in capabilities.iter().enumerate() {
        if index > 0 {
            payload.push(',');
        }
        payload.push('{');
        push_json_field(&mut payload, "id", &capability.id, true);
        push_json_field(&mut payload, "target", &capability.target, false);
        push_json_field(&mut payload, "version", &capability.version, false);
        push_json_field(
            &mut payload,
            "ownerPackage",
            &capability.owner_package,
            false,
        );
        push_json_array_field(&mut payload, "projectionKeys", &capability.projection_keys);
        push_json_array_field(&mut payload, "intentEvents", &capability.intent_events);
        push_json_array_field(&mut payload, "assetKinds", &capability.asset_kinds);
        push_json_array_field(&mut payload, "qssFeatures", &capability.qss_features);
        push_json_array_field(&mut payload, "quiComponents", &capability.qui_components);
        push_json_field(&mut payload, "fallback", &capability.fallback, false);
        payload.push('}');
    }
    payload.push(']');
    payload
}

fn push_json_field(payload: &mut String, key: &str, value: &str, first: bool) {
    if !first {
        payload.push(',');
    }
    push_json_string(payload, key);
    payload.push(':');
    push_json_string(payload, value);
}

fn push_json_array_field(payload: &mut String, key: &str, values: &[String]) {
    payload.push(',');
    push_json_string(payload, key);
    payload.push_str(":[");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            payload.push(',');
        }
        push_json_string(payload, value);
    }
    payload.push(']');
}

fn push_json_string(payload: &mut String, value: &str) {
    payload.push('"');
    for char in value.chars() {
        match char {
            '"' => payload.push_str("\\\""),
            '\\' => payload.push_str("\\\\"),
            '\n' => payload.push_str("\\n"),
            '\r' => payload.push_str("\\r"),
            '\t' => payload.push_str("\\t"),
            char if char.is_control() => {
                payload.push_str("\\u");
                payload.push_str(&format!("{:04x}", char as u32));
            }
            char => payload.push(char),
        }
    }
    payload.push('"');
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

pub fn current_profile() -> NativeProfile {
    if cfg!(debug_assertions) {
        NativeProfile::Debug
    } else {
        NativeProfile::Release
    }
}

pub fn current_platform() -> NativePlatform {
    if cfg!(target_os = "macos") {
        NativePlatform::MacOs
    } else if cfg!(target_os = "windows") {
        NativePlatform::Windows
    } else {
        NativePlatform::Linux
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_host_info_with_ts_contract_field_names() {
        let capability = RendererCapability {
            id: "native-wgpu.ui.surface@1".to_string(),
            target: "native".to_string(),
            version: "1.0.0".to_string(),
            owner_package: "@quajs/native-renderer".to_string(),
            projection_keys: vec!["view.ui.overlays".to_string()],
            intent_events: vec!["ui/intent".to_string()],
            asset_kinds: vec!["data".to_string()],
            qss_features: vec!["background-color".to_string()],
            qui_components: vec!["Box".to_string()],
            fallback: "reject-package".to_string(),
        };
        let host_info = NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
            .app_version("1.2.3")
            .build_number("42")
            .profile(NativeProfile::Release)
            .platform(NativePlatform::MacOs)
            .arch("arm64")
            .renderer_version("0.9.0")
            .backend_version(Some("wgpu-test"))
            .quickjs_version("quickjs-test")
            .capabilities(vec![capability])
            .build();
        let json = serde_json::to_value(&host_info).unwrap();

        assert_eq!(json["app"]["bundleId"], "dev.quajs.fixture");
        assert_eq!(json["app"]["profile"], "release");
        assert_eq!(json["app"]["platform"], "macos");
        assert_eq!(json["renderer"]["packageName"], "@quajs/native-renderer");
        assert_eq!(json["renderer"]["backendVersion"], "wgpu-test");
        assert_eq!(
            json["renderer"]["capabilityManifestHash"],
            host_info.renderer.capability_manifest_hash
        );
        assert_eq!(
            json["renderer"]["capabilities"][0]["ownerPackage"],
            "@quajs/native-renderer"
        );
        assert_eq!(
            json["renderer"]["capabilities"][0]["projectionKeys"][0],
            "view.ui.overlays"
        );
        assert_eq!(
            json["renderer"]["capabilities"][0]["intentEvents"][0],
            "ui/intent"
        );
        assert_eq!(json["renderer"]["capabilities"][0]["assetKinds"][0], "data");
        assert_eq!(
            json["renderer"]["capabilities"][0]["qssFeatures"][0],
            "background-color"
        );
        assert_eq!(
            json["renderer"]["capabilities"][0]["quiComponents"][0],
            "Box"
        );
        assert_eq!(json["runtime"]["quickjsVersion"], "quickjs-test");
        assert!(host_info.has_capability("native-wgpu.ui.surface@1"));
    }

    #[test]
    fn computes_stable_capability_manifest_hashes() {
        let mut capabilities = vec![RendererCapability {
            id: "native-wgpu.ui.surface@1".to_string(),
            target: "native".to_string(),
            version: "1.0.0".to_string(),
            owner_package: "@quajs/native-renderer".to_string(),
            projection_keys: vec!["view.ui.overlays".to_string()],
            intent_events: vec!["ui/intent".to_string()],
            asset_kinds: vec!["data".to_string()],
            qss_features: vec!["background-color".to_string()],
            qui_components: vec!["Box".to_string()],
            fallback: "reject-package".to_string(),
        }];

        let hash = capability_manifest_hash(&capabilities);
        let same_hash = capability_manifest_hash(&capabilities);
        capabilities[0]
            .qss_features
            .push("border-radius".to_string());
        let changed_hash = capability_manifest_hash(&capabilities);

        assert!(hash.starts_with("sha256:"));
        assert_eq!(hash.len(), "sha256:".len() + 64);
        assert_eq!(hash, same_hash);
        assert_ne!(hash, changed_hash);
    }

    #[test]
    fn omits_absent_optional_fields_from_host_info_contract_json() {
        let host_info = NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
            .capabilities(vec![RendererCapability {
                id: "native-wgpu.stage-layout@1".to_string(),
                target: "native".to_string(),
                version: "1.0.0".to_string(),
                owner_package: "@quajs/native-renderer".to_string(),
                projection_keys: vec!["QuaViewProjection.layout".to_string()],
                intent_events: Vec::new(),
                asset_kinds: Vec::new(),
                qss_features: Vec::new(),
                qui_components: Vec::new(),
                fallback: "reject-package".to_string(),
            }])
            .build();
        let json = serde_json::to_value(&host_info).unwrap();
        let renderer = json["renderer"].as_object().unwrap();
        let capability = json["renderer"]["capabilities"][0].as_object().unwrap();

        assert!(!renderer.contains_key("backendVersion"));
        assert!(!capability.contains_key("intentEvents"));
        assert!(!capability.contains_key("assetKinds"));
        assert!(!capability.contains_key("qssFeatures"));
        assert!(!capability.contains_key("quiComponents"));
    }
}
