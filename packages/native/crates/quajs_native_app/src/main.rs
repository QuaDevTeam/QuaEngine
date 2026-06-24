mod startup;
mod target_bundle;

use startup::{compile_time_native_app_config, create_native_startup_host_info};
use target_bundle::load_native_target_bundle_manifest;

fn main() {
    let target_bundle_manifest = std::env::var_os("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .map(load_native_target_bundle_manifest)
        .transpose()
        .expect("native target bundle manifest loads");
    let host_info = create_native_startup_host_info(
        compile_time_native_app_config(),
        target_bundle_manifest.as_ref(),
    )
    .expect("native startup validation succeeds");
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
