use quajs_native_runtime::{NativeHostInfo, NativeHostInfoBuilder};
use quajs_wgpu_renderer::native_wgpu_capabilities;

const DEFAULT_APP_NAME: &str = "QuaNativeApp";
const DEFAULT_BUNDLE_ID: &str = "dev.qua.native";

fn main() {
    let host_info = create_host_info(compile_time_native_app_config());
    println!(
        "Qua native host ready: renderer={} capabilities={}",
        host_info.renderer_version(),
        host_info.renderer.capabilities.len()
    );
    println!(
        "{}",
        serde_json::to_string(&host_info).expect("host info serializes")
    );
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NativeAppConfig {
    name: String,
    bundle_id: String,
    version: String,
    build_number: String,
}

impl NativeAppConfig {
    fn new(
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

fn compile_time_native_app_config() -> NativeAppConfig {
    NativeAppConfig::new(
        option_env!("QUA_NATIVE_APP_NAME").unwrap_or(DEFAULT_APP_NAME),
        option_env!("QUA_NATIVE_BUNDLE_ID").unwrap_or(DEFAULT_BUNDLE_ID),
        option_env!("QUA_NATIVE_APP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")),
        option_env!("QUA_NATIVE_BUILD_NUMBER").unwrap_or("dev"),
    )
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

#[cfg(test)]
mod tests {
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
}
