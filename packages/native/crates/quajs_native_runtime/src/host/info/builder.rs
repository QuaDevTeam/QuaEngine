use crate::quickjs::quickjs_runtime_version;

use super::{
    capability_manifest_hash, current_platform, current_profile, NativeAppInfo, NativeHostInfo,
    NativePlatform, NativeProfile, NativeRendererInfo, NativeRuntimeInfo, RendererCapability,
};

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
            quickjs_version: quickjs_runtime_version().to_string(),
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
