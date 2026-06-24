mod startup;
mod target_bundle;

use startup::{compile_time_native_app_config, create_native_startup_host_info};

fn main() {
    let host_info = create_native_startup_host_info(compile_time_native_app_config(), None)
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
