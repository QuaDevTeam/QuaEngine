use quajs_native_runtime::{NativeHostInfo, NativeHostInfoBuilder};
use quajs_wgpu_renderer::native_wgpu_capabilities;

use crate::target_bundle::{
    validate_native_target_bundle_manifest, NativeStartupError, NativeTargetBundleManifest,
};

pub const DEFAULT_APP_NAME: &str = "QuaNativeApp";
pub const DEFAULT_BUNDLE_ID: &str = "dev.qua.native";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeAppConfig {
    pub name: String,
    pub bundle_id: String,
    pub version: String,
    pub build_number: String,
}

impl NativeAppConfig {
    pub fn new(
        name: impl Into<String>,
        bundle_id: impl Into<String>,
        version: impl Into<String>,
        build_number: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            bundle_id: bundle_id.into(),
            version: version.into(),
            build_number: build_number.into(),
        }
    }
}

pub fn compile_time_native_app_config() -> NativeAppConfig {
    NativeAppConfig::new(
        option_env!("QUA_NATIVE_APP_NAME").unwrap_or(DEFAULT_APP_NAME),
        option_env!("QUA_NATIVE_BUNDLE_ID").unwrap_or(DEFAULT_BUNDLE_ID),
        option_env!("QUA_NATIVE_APP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")),
        option_env!("QUA_NATIVE_BUILD_NUMBER").unwrap_or("dev"),
    )
}

pub fn create_native_startup_host_info(
    config: NativeAppConfig,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
) -> Result<NativeHostInfo, NativeStartupError> {
    create_native_startup_host_info_with(config, target_bundle_manifest, create_host_info)
}

fn create_host_info(config: NativeAppConfig) -> NativeHostInfo {
    NativeHostInfoBuilder::new(config.name, config.bundle_id)
        .app_version(config.version)
        .build_number(config.build_number)
        .renderer_version(env!("CARGO_PKG_VERSION"))
        .native_runtime_version(env!("CARGO_PKG_VERSION"))
        .asset_adapter_version(env!("CARGO_PKG_VERSION"))
        .store_adapter_version(env!("CARGO_PKG_VERSION"))
        .capabilities(native_wgpu_capabilities())
        .build()
}

fn create_native_startup_host_info_with<F>(
    config: NativeAppConfig,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
    create: F,
) -> Result<NativeHostInfo, NativeStartupError>
where
    F: FnOnce(NativeAppConfig) -> NativeHostInfo,
{
    if let Some(manifest) = target_bundle_manifest {
        validate_native_target_bundle_manifest(manifest)?;
    }

    Ok(create(config))
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use crate::target_bundle::tests::native_manifest;

    use super::*;

    #[test]
    fn compile_time_config_uses_safe_defaults() {
        let config = compile_time_native_app_config();

        assert!(!config.name.is_empty());
        assert!(!config.bundle_id.is_empty());
        assert!(!config.version.is_empty());
        assert!(!config.build_number.is_empty());
    }

    #[test]
    fn host_info_uses_signed_app_config_and_rust_renderer_capabilities() {
        let host_info = create_host_info(NativeAppConfig::new(
            "Fixture",
            "dev.quajs.fixture",
            "1.2.3",
            "456",
        ));

        assert_eq!(host_info.app.name, "Fixture");
        assert_eq!(host_info.app.bundle_id, "dev.quajs.fixture");
        assert_eq!(host_info.app.version, "1.2.3");
        assert_eq!(host_info.app.build_number, "456");
        assert_eq!(host_info.renderer.package_name, "@quajs/native-renderer");
        assert!(host_info.has_capability("native-wgpu.ui.surface@1"));
        assert!(host_info.has_capability("native-wgpu.input.pointer@1"));
    }

    #[test]
    fn accepts_native_target_bundle_manifest_before_building_host_info() {
        let manifest = native_manifest();
        let created = Cell::new(false);
        let host_info = create_native_startup_host_info_with(
            NativeAppConfig::new("Fixture", "dev.quajs.fixture", "1.0.0", "100"),
            Some(&manifest),
            |config| {
                created.set(true);
                create_host_info(config)
            },
        )
        .expect("native manifest validates");

        assert!(created.get());
        assert_eq!(host_info.app.bundle_id, "dev.quajs.fixture");
    }

    #[test]
    fn rejects_foreign_target_bundle_manifest_before_building_host_info() {
        let mut manifest = native_manifest();
        manifest.dependencies.extend([
            crate::target_bundle::TargetBundleReference::Specifier(
                "@quajs/renderer-web/plugins/ui".to_string(),
            ),
            crate::target_bundle::TargetBundleReference::Specifier(
                "@quajs/cocos-host/runtime".to_string(),
            ),
        ]);
        let created = Cell::new(false);
        let error = create_native_startup_host_info_with(
            NativeAppConfig::new("Fixture", "dev.quajs.fixture", "1.0.0", "100"),
            Some(&manifest),
            |config| {
                created.set(true);
                create_host_info(config)
            },
        )
        .expect_err("foreign target manifest is rejected");

        assert!(!created.get());
        assert!(error
            .to_string()
            .contains("mixes target bootstrap core adapters for web, cocos, native"));
    }
}
