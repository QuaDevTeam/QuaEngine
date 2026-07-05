use winit::dpi::PhysicalSize;

use super::config::{native_window_smoke_enabled, DEFAULT_WINDOW_SMOKE_FRAME, WINDOW_SMOKE_ENV};
use super::error::NativeWindowSmokeError;
use super::frame::{
    frame_json_for_window, normalized_physical_size, normalized_scale_factor,
    window_frame_dimensions,
};
use super::present::{is_occluded_or_timeout_present_error, is_recoverable_surface_present_error};
use super::report::NativeWindowSmokeReport;

#[test]
fn smoke_env_ignores_absent_false_and_zero_values() {
    std::env::remove_var(WINDOW_SMOKE_ENV);
    assert!(!native_window_smoke_enabled());

    std::env::set_var(WINDOW_SMOKE_ENV, "0");
    assert!(!native_window_smoke_enabled());

    std::env::set_var(WINDOW_SMOKE_ENV, "false");
    assert!(!native_window_smoke_enabled());

    std::env::set_var(WINDOW_SMOKE_ENV, "1");
    assert!(native_window_smoke_enabled());

    std::env::remove_var(WINDOW_SMOKE_ENV);
}

#[test]
fn frame_json_for_window_rewrites_container_only() {
    let json = frame_json_for_window(DEFAULT_WINDOW_SMOKE_FRAME, 480.0, 270.0, 2.0)
        .expect("frame JSON should serialize");
    let value: serde_json::Value = serde_json::from_str(&json).expect("frame JSON parses");

    assert_eq!(value["container"]["width"], 480.0);
    assert_eq!(value["container"]["height"], 270.0);
    assert_eq!(value["container"]["devicePixelRatio"], 2.0);
    assert_eq!(value["layout"]["preset"], "landscape");
    assert_eq!(
        value["view"]["ui"]["overlays"][0]["elementId"],
        "compiled-menu"
    );
}

#[test]
fn normalizes_invalid_window_measurements() {
    assert_eq!(
        normalized_physical_size(PhysicalSize::new(0, 0)),
        PhysicalSize::new(1, 1)
    );
    assert_eq!(normalized_scale_factor(0.0), 1.0);
    assert_eq!(normalized_scale_factor(f64::NAN), 1.0);
    assert_eq!(normalized_scale_factor(2.0), 2.0);
}

#[test]
fn derives_window_frame_dimensions_from_physical_size_and_scale() {
    let dimensions = window_frame_dimensions(PhysicalSize::new(1920, 1080), 2.0);
    assert_eq!(dimensions.physical_size, PhysicalSize::new(1920, 1080));
    assert_eq!(dimensions.logical_width, 960.0);
    assert_eq!(dimensions.logical_height, 540.0);
    assert_eq!(dimensions.device_pixel_ratio, 2.0);
}

#[test]
fn detects_occluded_or_timeout_present_errors() {
    assert!(is_occluded_or_timeout_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface is occluded."
        )
    ));
    assert!(is_occluded_or_timeout_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface acquisition timed out."
        )
    ));
    assert!(!is_occluded_or_timeout_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface was lost."
        )
    ));
    assert!(!is_occluded_or_timeout_present_error(
        &NativeWindowSmokeError::new("Native renderer smoke frame failed: validation error.")
    ));
}

#[test]
fn detects_recoverable_surface_present_errors() {
    assert!(is_recoverable_surface_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface was lost."
        )
    ));
    assert!(is_recoverable_surface_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface configuration is outdated."
        )
    ));
    assert!(!is_recoverable_surface_present_error(
        &NativeWindowSmokeError::new(
            "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface is occluded."
        )
    ));
    assert!(!is_recoverable_surface_present_error(
        &NativeWindowSmokeError::new("Native renderer smoke frame failed: validation error.")
    ));
}

#[test]
fn window_smoke_report_serializes_texture_lifecycle_metrics() {
    let report = NativeWindowSmokeReport {
        adapter_name: "test-adapter".to_string(),
        backend: "wgpu".to_string(),
        surface_format: "Rgba8UnormSrgb".to_string(),
        present_mode: "Fifo".to_string(),
        present_status: "Presented".to_string(),
        presented: true,
        present_attempt_count: 1,
        resize_count: 0,
        surface_recovery_count: 0,
        texture_upload_pending_request_count: 0,
        texture_upload_already_resident_count: 2,
        texture_upload_uploaded_count: 2,
        texture_upload_error_count: 0,
        texture_upload_resubmit_count: 1,
        resubmitted_after_texture_upload: true,
        texture_lifecycle_sync_count: 1,
        texture_lifecycle_initial_sync_count: 1,
        texture_lifecycle_observed_bundle_count: 2,
        texture_lifecycle_tracked_package_count: 2,
        texture_lifecycle_blocked_package_count: 0,
        texture_lifecycle_release_attempt_count: 0,
        texture_lifecycle_released_package_count: 0,
        texture_lifecycle_texture_cleanup_error_count: 0,
        pointer_event_count: 0,
        pointer_dispatch_count: 0,
        pointer_intent_emit_count: 1,
        pointer_probe_count: 1,
        pointer_cancel_count: 0,
        pointer_last_intent_type: Some("ui/intent".to_string()),
        focus_gain_count: 0,
        focus_loss_count: 0,
        focus_intent_emit_count: 0,
        keyboard_event_count: 0,
        keyboard_press_count: 0,
        keyboard_release_count: 0,
        keyboard_repeat_count: 0,
        keyboard_intent_emit_count: 0,
        ime_event_count: 0,
        ime_preedit_count: 0,
        ime_commit_count: 0,
        ime_last_text_byte_count: None,
        last_resize_physical_width: None,
        last_resize_physical_height: None,
        logical_width: 960.0,
        logical_height: 540.0,
        physical_width: 1920,
        physical_height: 1080,
        device_pixel_ratio: 2.0,
        revision: 1,
        pass_count: 1,
        batch_count: 1,
        command_count: 1,
        submitted_command_buffer_count: 1,
    };

    let value = serde_json::to_value(report).expect("report should serialize");

    assert_eq!(value["textureLifecycleSyncCount"], 1);
    assert_eq!(value["textureLifecycleInitialSyncCount"], 1);
    assert_eq!(value["textureLifecycleObservedBundleCount"], 2);
    assert_eq!(value["textureLifecycleTrackedPackageCount"], 2);
    assert_eq!(value["textureLifecycleBlockedPackageCount"], 0);
    assert_eq!(value["textureLifecycleReleaseAttemptCount"], 0);
    assert_eq!(value["textureLifecycleReleasedPackageCount"], 0);
    assert_eq!(value["textureLifecycleTextureCleanupErrorCount"], 0);
    assert_eq!(value["pointerCancelCount"], 0);
    assert_eq!(value["focusGainCount"], 0);
    assert_eq!(value["focusLossCount"], 0);
    assert_eq!(value["focusIntentEmitCount"], 0);
    assert_eq!(value["keyboardEventCount"], 0);
    assert_eq!(value["keyboardPressCount"], 0);
    assert_eq!(value["keyboardReleaseCount"], 0);
    assert_eq!(value["keyboardRepeatCount"], 0);
    assert_eq!(value["keyboardIntentEmitCount"], 0);
    assert_eq!(value["imeEventCount"], 0);
    assert_eq!(value["imePreeditCount"], 0);
    assert_eq!(value["imeCommitCount"], 0);
    assert!(value["imeLastTextByteCount"].is_null());
}
