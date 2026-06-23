use quajs_native_runtime::{NativeHostInfo, NativeHostInfoBuilder};
use quajs_wgpu_renderer::native_wgpu_capabilities;

fn main() {
    let host_info = create_host_info();
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

fn create_host_info() -> NativeHostInfo {
    NativeHostInfoBuilder::new("QuaNativeApp", "dev.qua.native")
        .app_version(env!("CARGO_PKG_VERSION"))
        .build_number("dev")
        .renderer_version(env!("CARGO_PKG_VERSION"))
        .native_runtime_version(env!("CARGO_PKG_VERSION"))
        .asset_adapter_version(env!("CARGO_PKG_VERSION"))
        .store_adapter_version(env!("CARGO_PKG_VERSION"))
        .capabilities(native_wgpu_capabilities())
        .build()
}
