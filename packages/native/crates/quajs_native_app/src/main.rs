#[cfg(any(test, feature = "native-audio-rodio"))]
mod audio_backend;
#[cfg(any(test, feature = "image-decode"))]
mod audio_sync;
#[cfg(feature = "native-font-ab-glyph")]
mod font_backend;
#[cfg(any(test, feature = "image-decode"))]
mod font_sync;
#[cfg(any(test, feature = "image-decode"))]
mod host_assets;
mod logging;
#[cfg(any(test, feature = "image-decode"))]
mod product_app_loop;
#[cfg(feature = "native-window")]
mod product_app_shell;
#[cfg(any(test, feature = "image-decode"))]
mod product_bridge;
#[cfg(any(test, feature = "native-window"))]
mod product_frame_pacer;
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
#[cfg(feature = "native-video-gif")]
mod video_backend;
#[cfg(any(test, feature = "image-decode"))]
mod video_sync;
#[cfg(feature = "native-window")]
mod window_smoke;

use renderer_smoke::run_renderer_smoke_from_env;
use startup::{compile_time_native_app_config, create_native_startup_host_info};
use target_bundle::load_native_target_bundle_manifest;
#[cfg(feature = "native-window")]
use window_smoke::run_native_window_smoke_from_env;

fn main() {
    let _ = logging::init_native_logging();
    if let Err(error) = run() {
        log::error!("native app exited with an error: {error}");
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    if env_flag_enabled("QUA_NATIVE_QUICKJS_BRIDGE")
        && env_flag_enabled("QUA_NATIVE_PRODUCT_BRIDGE")
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Native bridge modes are exclusive; set only one of QUA_NATIVE_QUICKJS_BRIDGE or QUA_NATIVE_PRODUCT_BRIDGE.",
        )
        .into());
    }

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

    #[cfg(feature = "image-decode")]
    if product_bridge::is_product_bridge_requested() {
        product_bridge::run_product_bridge_from_stdio()?;
        return Ok(());
    }
    #[cfg(not(feature = "image-decode"))]
    if env_flag_enabled("QUA_NATIVE_PRODUCT_BRIDGE") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Native product bridge requires the image-decode Cargo feature.",
        )
        .into());
    }

    let manifest_path = std::env::var_os("QUA_NATIVE_TARGET_BUNDLE_MANIFEST");
    match &manifest_path {
        Some(path) => log::debug!(
            "loading native target bundle manifest from {}",
            std::path::Path::new(path).display()
        ),
        None => log::debug!("no QUA_NATIVE_TARGET_BUNDLE_MANIFEST set; using compile-time config"),
    }
    let target_bundle_manifest = manifest_path
        .map(load_native_target_bundle_manifest)
        .transpose()
        .inspect_err(|error| log::error!("native target bundle manifest failed to load: {error}"))?;
    let host_info = create_native_startup_host_info(
        compile_time_native_app_config(),
        target_bundle_manifest.as_ref(),
    )
    .inspect_err(|error| log::error!("native startup host info failed to build: {error}"))?;
    log::info!(
        "native host ready: renderer={} backend={} capabilities={}",
        host_info.renderer_version(),
        host_info.renderer.backend,
        host_info.renderer.capabilities.len()
    );
    // Stays on stdout: `demo/scripts/native-dev.mjs` parses these two lines.
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
            "Qua native window smoke: adapter={} surface={} size={}x{} status={} presented={} attempts={} targetFrames={} renderedFrames={} resizeCount={} surfaceRecoveryCount={} surfaceRecoveryAttempts={} surfaceRecoverySuccesses={} surfaceRecoveryMissingSize={} surfaceRecoveryErrors={} deviceRecoveryCount={} deviceRecoveryAttempts={} deviceRecoverySuccesses={} deviceRecoveryMissingSize={} deviceRecoveryErrors={} presentFailures={} recoverableSurfaceFailures={} recoverableDeviceFailures={} lastPresentFailure={} lastSurfacePresentFailure={} lastRecoveryAction={} lastSurfaceRecoveryStatus={} lastDeviceRecoveryStatus={} appLifecycle={} appLifecycleTicks={} appRedrawRequests={} textureUploads={} textureUploadErrors={} textureUploadResubmits={} textureResubmitted={} textureLifecycleSyncs={} textureLifecycleInitialSyncs={} textureLifecycleTrackedPackages={} textureLifecycleReleaseAttempts={} textureLifecycleReleasedPackages={} textureLifecycleCleanupErrors={} textureShutdowns={} textureShutdownReleasedResources={} textureShutdownReleasedTextures={} textureShutdownCleanupErrors={} textureShutdownVideoFrameUploads={} textureShutdownVideoFrameReleases={} textureShutdownVideoFrameErrors={} textureShutdownFontAtlasUploads={} textureShutdownFontAtlasReleases={} textureShutdownFontAtlasErrors={} audioBackendPlans={} audioBackendCommands={} audioBackendTracks={} videoBackendLoads={} videoBackendResidentAssets={} videoBackendPlans={} videoBackendCommands={} videoBackendActiveStreams={} videoBackendDecodedStreams={} videoBackendDecodeFailures={} videoBackendMissingAssets={} videoBackendPublishedFrames={} videoBackendReleasedTextures={} pointerEvents={} pointerIntents={} pointerLastIntent={} imeEvents={} imeEnabled={} imeDisabled={} imePreedit={} imeCommit={} passes={} commands={} submittedCommandBuffers={}",
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
            report.surface_recovery_attempt_count,
            report.surface_recovery_success_count,
            report.surface_recovery_missing_size_count,
            report.surface_recovery_error_count,
            report.device_recovery_count,
            report.device_recovery_attempt_count,
            report.device_recovery_success_count,
            report.device_recovery_missing_size_count,
            report.device_recovery_error_count,
            report.present_failure_count,
            report.recoverable_surface_failure_count,
            report.recoverable_device_failure_count,
            report.last_present_failure_kind.as_deref().unwrap_or("none"),
            report
                .last_surface_present_failure_kind
                .as_deref()
                .unwrap_or("none"),
            report.last_recovery_action.as_deref().unwrap_or("none"),
            report
                .last_surface_recovery_status
                .as_deref()
                .unwrap_or("none"),
            report
                .last_device_recovery_status
                .as_deref()
                .unwrap_or("none"),
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
            report.texture_shutdown_video_frame_texture_uploaded_count,
            report.texture_shutdown_video_frame_texture_released_count,
            report.texture_shutdown_video_frame_texture_error_count,
            report.texture_shutdown_font_atlas_uploaded_count,
            report.texture_shutdown_font_atlas_released_count,
            report.texture_shutdown_font_atlas_error_count,
            report.audio_backend_applied_plan_count,
            report.audio_backend_applied_command_count,
            report.audio_backend_active_track_count,
            report.video_backend_loaded_asset_count,
            report.video_backend_resident_asset_count,
            report.video_backend_applied_plan_count,
            report.video_backend_applied_command_count,
            report.video_backend_active_stream_count,
            report.video_backend_decoded_stream_count,
            report.video_backend_decode_failure_count,
            report.video_backend_missing_asset_count,
            report.video_backend_published_frame_count,
            report.video_backend_released_texture_count,
            report.pointer_event_count,
            report.pointer_intent_emit_count,
            report.pointer_last_intent_type.as_deref().unwrap_or("none"),
            report.ime_event_count,
            report.ime_enabled_count,
            report.ime_disabled_count,
            report.ime_preedit_count,
            report.ime_commit_count,
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

fn env_flag_enabled(name: &str) -> bool {
    match std::env::var_os(name) {
        Some(value) => {
            let value = value.to_string_lossy();
            value != "0" && !value.is_empty()
        }
        None => false,
    }
}
