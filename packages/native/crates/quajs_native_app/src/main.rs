use quajs_native_runtime::{
    NativeAppInfo, NativeHostInfo, NativePlatform, NativeProfile, NativeRendererInfo,
    NativeRuntimeInfo,
};
use quajs_wgpu_renderer::native_wgpu_capabilities;

fn main() {
    let host_info = create_host_info();
    println!(
        "Qua native host ready: renderer={} capabilities={}",
        host_info.renderer_version(),
        host_info.renderer.capabilities.len()
    );
}

fn create_host_info() -> NativeHostInfo {
    NativeHostInfo {
        app: NativeAppInfo {
            name: "QuaNativeApp".to_string(),
            bundle_id: "dev.qua.native".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            build_number: "dev".to_string(),
            profile: if cfg!(debug_assertions) {
                NativeProfile::Debug
            } else {
                NativeProfile::Release
            },
            platform: current_platform(),
            arch: std::env::consts::ARCH.to_string(),
        },
        renderer: NativeRendererInfo {
            package_name: "@quajs/native-renderer".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            backend: "wgpu".to_string(),
            backend_version: None,
            capabilities: native_wgpu_capabilities(),
        },
        runtime: NativeRuntimeInfo {
            quickjs_version: "pending".to_string(),
            native_runtime_version: env!("CARGO_PKG_VERSION").to_string(),
            asset_adapter_version: env!("CARGO_PKG_VERSION").to_string(),
            store_adapter_version: env!("CARGO_PKG_VERSION").to_string(),
        },
    }
}

fn current_platform() -> NativePlatform {
    if cfg!(target_os = "macos") {
        NativePlatform::MacOs
    } else if cfg!(target_os = "windows") {
        NativePlatform::Windows
    } else {
        NativePlatform::Linux
    }
}
