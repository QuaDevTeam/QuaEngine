mod renderer_smoke;
mod startup;
mod target_bundle;

use renderer_smoke::run_renderer_smoke_from_env;
use startup::{compile_time_native_app_config, create_native_startup_host_info};
use target_bundle::load_native_target_bundle_manifest;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let target_bundle_manifest = std::env::var_os("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .map(load_native_target_bundle_manifest)
        .transpose()?;
    let host_info = create_native_startup_host_info(
        compile_time_native_app_config(),
        target_bundle_manifest.as_ref(),
    )?;
    println!(
        "Qua native host ready: renderer={} capabilities={}",
        host_info.renderer_version(),
        host_info.renderer.capabilities.len()
    );
    println!("{}", serde_json::to_string(&host_info)?);
    if let Some(summary) = run_renderer_smoke_from_env()? {
        println!(
            "Qua native renderer smoke: revision={} passes={} batches={} commands={} resources={} missingResources={}",
            summary.revision,
            summary.pass_count,
            summary.batch_count,
            summary.command_count,
            summary.resource_count,
            summary.missing_resource_count
        );
        println!(
            "Qua native renderer smoke json: {}",
            serde_json::to_string(&summary)?
        );
    }
    Ok(())
}
