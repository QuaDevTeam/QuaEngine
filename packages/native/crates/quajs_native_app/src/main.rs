#[cfg(any(test, feature = "image-decode"))]
mod product_app_loop;
#[cfg(any(test, feature = "image-decode"))]
mod product_frame_scheduler;
#[cfg(feature = "native-window")]
mod product_input;
#[cfg(any(test, feature = "image-decode"))]
mod product_loop;
#[cfg(any(test, feature = "image-decode"))]
mod product_runtime;
#[cfg(feature = "native-window")]
mod product_window;
#[cfg(feature = "native-window")]
mod product_window_loop;
#[cfg(feature = "quickjs-rquickjs")]
mod quickjs_bridge;
mod renderer_smoke;
mod startup;
mod target_bundle;
#[cfg(any(test, feature = "image-decode"))]
mod texture_sync;
#[cfg(feature = "native-window")]
mod window_smoke;

use renderer_smoke::run_renderer_smoke_from_env;
use startup::{compile_time_native_app_config, create_native_startup_host_info};
use target_bundle::load_native_target_bundle_manifest;
#[cfg(feature = "native-window")]
use window_smoke::run_native_window_smoke_from_env;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(feature = "quickjs-rquickjs")]
    if quickjs_bridge::is_quickjs_bridge_requested() {
        quickjs_bridge::run_quickjs_bridge_from_stdio()?;
        return Ok(());
    }
    #[cfg(not(feature = "quickjs-rquickjs"))]
    if std::env::var_os("QUA_NATIVE_QUICKJS_BRIDGE").is_some() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Native QuickJS bridge requires the quickjs-rquickjs Cargo feature.",
        )
        .into());
    }

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
            "Qua native renderer smoke: revision={} passes={} batches={} commands={} resources={} missingResources={} textureUploadRequests={} textureUploadSkippedResources={} textureUploadNonTextureResources={} audioBackendPlans={} audioBackendCommands={} audioBackendTracks={}",
            summary.revision,
            summary.pass_count,
            summary.batch_count,
            summary.command_count,
            summary.resource_count,
            summary.missing_resource_count,
            summary.texture_upload_request_count,
            summary.texture_upload_skipped_resource_count,
            summary.texture_upload_non_texture_resource_count,
            summary.audio_backend.applied_plan_count,
            summary.audio_backend.applied_command_count,
            summary.audio_backend.active_track_count
        );
        println!(
            "Qua native renderer smoke json: {}",
            serde_json::to_string(&summary)?
        );
    }
    #[cfg(feature = "native-window")]
    if let Some(report) = run_native_window_smoke_from_env()? {
        println!(
            "Qua native window smoke: adapter={} surface={} size={}x{} status={} presented={} attempts={} targetFrames={} renderedFrames={} resizeCount={} surfaceRecoveryCount={} appLifecycle={} appLifecycleTicks={} appRedrawRequests={} textureUploads={} textureUploadErrors={} textureUploadResubmits={} textureResubmitted={} textureLifecycleSyncs={} textureLifecycleInitialSyncs={} textureLifecycleTrackedPackages={} textureLifecycleReleaseAttempts={} textureLifecycleReleasedPackages={} textureLifecycleCleanupErrors={} textureShutdowns={} textureShutdownReleasedResources={} textureShutdownReleasedTextures={} textureShutdownCleanupErrors={} pointerEvents={} pointerIntents={} pointerLastIntent={} passes={} commands={} submittedCommandBuffers={}",
            report.adapter_name,
            report.surface_format,
            report.physical_width,
            report.physical_height,
            report.present_status,
            report.presented,
            report.present_attempt_count,
            report.target_frame_count,
            report.rendered_frame_count,
            report.resize_count,
            report.surface_recovery_count,
            report.app_lifecycle_state,
            report.app_lifecycle_tick_request_count,
            report.app_redraw_request_count,
            report.texture_upload_uploaded_count,
            report.texture_upload_error_count,
            report.texture_upload_resubmit_count,
            report.resubmitted_after_texture_upload,
            report.texture_lifecycle_sync_count,
            report.texture_lifecycle_initial_sync_count,
            report.texture_lifecycle_tracked_package_count,
            report.texture_lifecycle_release_attempt_count,
            report.texture_lifecycle_released_package_count,
            report.texture_lifecycle_texture_cleanup_error_count,
            report.texture_shutdown_count,
            report.texture_shutdown_released_resource_count,
            report.texture_shutdown_released_count,
            report.texture_shutdown_cleanup_error_count,
            report.pointer_event_count,
            report.pointer_intent_emit_count,
            report.pointer_last_intent_type.as_deref().unwrap_or("none"),
            report.pass_count,
            report.command_count,
            report.submitted_command_buffer_count
        );
        println!(
            "Qua native window smoke json: {}",
            serde_json::to_string(&report)?
        );
    }
    Ok(())
}
