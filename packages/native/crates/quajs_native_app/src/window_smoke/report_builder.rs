use super::frame::WindowFrameDimensions;
use super::input::NativeWindowSmokeInputMetrics;
use super::metrics::{
    NativeWindowSmokeAudioMetrics, NativeWindowSmokeTextureMetrics, NativeWindowSmokeVideoMetrics,
};
use super::report::NativeWindowSmokeReport;
use crate::product_app_loop::{NativeProductAppLifecycleState, NativeProductAppLoopSnapshot};
use crate::product_frame_scheduler::NativeProductSurfaceRecoveryMetrics;
use crate::product_window::{
    NativeProductWindowPhysicalSize, NativeProductWindowPresentFailureKind,
};
use quajs_wgpu_renderer::renderer::RealWgpuEncodedFrameCapture;

pub(super) struct NativeWindowSmokeReportInput<'a> {
    pub adapter_name: &'a str,
    pub surface_format: &'a str,
    pub present_mode: &'a str,
    pub present_status: &'a str,
    pub presented: bool,
    pub present_attempt_count: usize,
    pub target_frame_count: usize,
    pub rendered_frame_count: usize,
    pub resize_count: usize,
    pub surface_recovery_count: usize,
    pub device_recovery_count: usize,
    pub recovery_metrics: NativeProductSurfaceRecoveryMetrics,
    pub last_present_failure_kind: Option<NativeProductWindowPresentFailureKind>,
    pub texture_metrics: &'a NativeWindowSmokeTextureMetrics,
    pub audio_metrics: &'a NativeWindowSmokeAudioMetrics,
    pub video_metrics: &'a NativeWindowSmokeVideoMetrics,
    pub input_metrics: &'a NativeWindowSmokeInputMetrics,
    pub app_loop: NativeProductAppLoopSnapshot,
    pub last_resize_physical_size: Option<NativeProductWindowPhysicalSize>,
    pub dimensions: WindowFrameDimensions,
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub submitted_command_buffer_count: usize,
    pub font_atlas_uploaded_count: usize,
    pub font_atlas_text_draw_count: usize,
    pub shaped_text_draw_count: usize,
    pub bitmap_text_draw_count: usize,
    pub font_atlas_resource_ids: Vec<String>,
    pub linear_sampled_texture_bind_group_count: usize,
    pub nearest_sampled_texture_bind_group_count: usize,
    pub frame_capture: Option<&'a RealWgpuEncodedFrameCapture>,
}

pub(super) fn build_window_smoke_report(
    input: NativeWindowSmokeReportInput<'_>,
) -> NativeWindowSmokeReport {
    NativeWindowSmokeReport {
        adapter_name: input.adapter_name.to_string(),
        backend: "wgpu".to_string(),
        surface_format: input.surface_format.to_string(),
        present_mode: input.present_mode.to_string(),
        present_status: input.present_status.to_string(),
        presented: input.presented,
        present_attempt_count: input.present_attempt_count,
        target_frame_count: input.target_frame_count,
        rendered_frame_count: input.rendered_frame_count,
        resize_count: input.resize_count,
        surface_recovery_count: input.surface_recovery_count,
        surface_recovery_attempt_count: input.recovery_metrics.surface_recovery_attempt_count,
        surface_recovery_success_count: input.recovery_metrics.surface_recovery_success_count,
        surface_recovery_missing_size_count: input
            .recovery_metrics
            .surface_recovery_missing_size_count,
        surface_recovery_error_count: input.recovery_metrics.surface_recovery_error_count,
        device_recovery_count: input.device_recovery_count,
        device_recovery_attempt_count: input.recovery_metrics.device_recovery_attempt_count,
        device_recovery_success_count: input.recovery_metrics.device_recovery_success_count,
        device_recovery_missing_size_count: input
            .recovery_metrics
            .device_recovery_missing_size_count,
        device_recovery_error_count: input.recovery_metrics.device_recovery_error_count,
        present_failure_count: input.recovery_metrics.present_failure_count,
        recoverable_surface_failure_count: input.recovery_metrics.recoverable_surface_failure_count,
        recoverable_device_failure_count: input.recovery_metrics.recoverable_device_failure_count,
        last_present_failure_kind: input
            .recovery_metrics
            .last_present_failure_kind
            .map(|kind| kind.label().to_string()),
        last_surface_present_failure_kind: input
            .last_present_failure_kind
            .map(|kind| kind.label().to_string()),
        last_recovery_action: input
            .recovery_metrics
            .last_recovery_action
            .map(|action| action.label().to_string()),
        last_surface_recovery_status: input
            .recovery_metrics
            .last_surface_recovery_status
            .map(|status| status.label().to_string()),
        last_device_recovery_status: input
            .recovery_metrics
            .last_device_recovery_status
            .map(|status| status.label().to_string()),
        texture_upload_pending_request_count: input
            .texture_metrics
            .upload_last_pending_request_count,
        texture_upload_already_resident_count: input
            .texture_metrics
            .upload_last_already_resident_count,
        texture_upload_uploaded_count: input.texture_metrics.upload_uploaded_count,
        texture_upload_error_count: input.texture_metrics.upload_error_count,
        texture_upload_resubmit_count: input.texture_metrics.upload_resubmit_count,
        resubmitted_after_texture_upload: input.texture_metrics.resubmitted_after_texture_upload(),
        font_atlas_uploaded_count: input.font_atlas_uploaded_count,
        font_atlas_error_count: input.texture_metrics.font_atlas_error_count,
        font_atlas_text_draw_count: input.font_atlas_text_draw_count,
        shaped_text_draw_count: input.shaped_text_draw_count,
        bitmap_text_draw_count: input.bitmap_text_draw_count,
        font_atlas_resource_ids: input.font_atlas_resource_ids,
        linear_sampled_texture_bind_group_count: input.linear_sampled_texture_bind_group_count,
        nearest_sampled_texture_bind_group_count: input.nearest_sampled_texture_bind_group_count,
        texture_lifecycle_sync_count: input.texture_metrics.lifecycle_sync_count,
        texture_lifecycle_initial_sync_count: input.texture_metrics.lifecycle_initial_sync_count,
        texture_lifecycle_observed_bundle_count: input
            .texture_metrics
            .lifecycle_last_observed_bundle_count,
        texture_lifecycle_tracked_package_count: input
            .texture_metrics
            .lifecycle_last_tracked_package_count,
        texture_lifecycle_blocked_package_count: input
            .texture_metrics
            .lifecycle_last_blocked_package_count,
        texture_lifecycle_release_attempt_count: input
            .texture_metrics
            .lifecycle_release_attempt_count,
        texture_lifecycle_released_package_count: input
            .texture_metrics
            .lifecycle_released_package_count,
        texture_lifecycle_texture_cleanup_error_count: input
            .texture_metrics
            .lifecycle_texture_cleanup_error_count,
        texture_shutdown_count: input.texture_metrics.shutdown_count,
        texture_shutdown_released_resource_count: input
            .texture_metrics
            .shutdown_released_resource_count,
        texture_shutdown_host_cleanup_count: input.texture_metrics.shutdown_host_cleanup_count,
        texture_shutdown_released_count: input.texture_metrics.shutdown_texture_released_count,
        texture_shutdown_cleanup_error_count: input
            .texture_metrics
            .shutdown_texture_cleanup_error_count,
        texture_shutdown_video_frame_texture_uploaded_count: input
            .texture_metrics
            .shutdown_video_frame_texture_uploaded_count,
        texture_shutdown_video_frame_texture_released_count: input
            .texture_metrics
            .shutdown_video_frame_texture_released_count,
        texture_shutdown_video_frame_texture_error_count: input
            .texture_metrics
            .shutdown_video_frame_texture_error_count,
        texture_shutdown_font_atlas_uploaded_count: input
            .texture_metrics
            .shutdown_font_atlas_uploaded_count,
        texture_shutdown_font_atlas_released_count: input
            .texture_metrics
            .shutdown_font_atlas_released_count,
        texture_shutdown_font_atlas_error_count: input
            .texture_metrics
            .shutdown_font_atlas_error_count,
        audio_backend_applied_plan_count: input.audio_metrics.applied_plan_count,
        audio_backend_applied_command_count: input.audio_metrics.applied_command_count,
        audio_backend_active_track_count: input.audio_metrics.active_track_count,
        audio_backend_peak_active_track_count: input.audio_metrics.peak_active_track_count,
        video_backend_loaded_asset_count: input.video_metrics.loaded_asset_count,
        video_backend_resident_asset_count: input.video_metrics.resident_asset_count,
        video_backend_applied_plan_count: input.video_metrics.applied_plan_count,
        video_backend_applied_command_count: input.video_metrics.applied_command_count,
        video_backend_active_stream_count: input.video_metrics.active_stream_count,
        video_backend_decoded_stream_count: input.video_metrics.decoded_stream_count,
        video_backend_decode_failure_count: input.video_metrics.decode_failure_count,
        video_backend_missing_asset_count: input.video_metrics.missing_asset_count,
        video_backend_published_frame_count: input.video_metrics.published_frame_count,
        video_backend_pending_frame_count: input.video_metrics.pending_frame_count,
        video_backend_released_texture_count: input.video_metrics.released_texture_count,
        video_backend_pending_release_count: input.video_metrics.pending_release_count,
        pointer_event_count: input.input_metrics.pointer_event_count,
        pointer_dispatch_count: input.input_metrics.pointer_dispatch_count,
        pointer_intent_emit_count: input.input_metrics.pointer_intent_emit_count,
        pointer_probe_count: input.input_metrics.pointer_probe_count,
        pointer_cancel_count: input.input_metrics.pointer_cancel_count,
        pointer_last_intent_type: input.input_metrics.last_intent_type.clone(),
        focus_gain_count: input.input_metrics.focus_gain_count,
        focus_loss_count: input.input_metrics.focus_loss_count,
        focus_intent_emit_count: input.input_metrics.focus_intent_emit_count,
        keyboard_event_count: input.input_metrics.keyboard_event_count,
        keyboard_press_count: input.input_metrics.keyboard_press_count,
        keyboard_release_count: input.input_metrics.keyboard_release_count,
        keyboard_repeat_count: input.input_metrics.keyboard_repeat_count,
        keyboard_intent_emit_count: input.input_metrics.keyboard_intent_emit_count,
        ime_event_count: input.input_metrics.ime_event_count,
        ime_enabled_count: input.input_metrics.ime_enabled_count,
        ime_disabled_count: input.input_metrics.ime_disabled_count,
        ime_preedit_count: input.input_metrics.ime_preedit_count,
        ime_commit_count: input.input_metrics.ime_commit_count,
        ime_intent_emit_count: input.input_metrics.ime_intent_emit_count,
        ime_composition_active: input.input_metrics.ime_composition_active,
        ime_last_text_byte_count: input.input_metrics.ime_last_text_byte_count,
        ime_last_cursor_start: input.input_metrics.ime_last_cursor_start,
        ime_last_cursor_end: input.input_metrics.ime_last_cursor_end,
        app_lifecycle_state: lifecycle_state_label(input.app_loop.lifecycle_state).to_string(),
        app_focused: input.app_loop.focused,
        app_visible: input.app_loop.visible,
        app_redraw_pending: input.app_loop.redraw_pending,
        app_resume_count: input.app_loop.resume_count,
        app_suspend_count: input.app_loop.suspend_count,
        app_visibility_change_count: input.app_loop.visibility_change_count,
        app_lifecycle_tick_request_count: input.app_loop.lifecycle_tick_request_count,
        app_redraw_request_count: input.app_loop.redraw_request_count,
        last_resize_physical_width: input.last_resize_physical_size.map(|size| size.width),
        last_resize_physical_height: input.last_resize_physical_size.map(|size| size.height),
        logical_width: input.dimensions.logical_width,
        logical_height: input.dimensions.logical_height,
        physical_width: input.dimensions.physical_size.width,
        physical_height: input.dimensions.physical_size.height,
        device_pixel_ratio: input.dimensions.device_pixel_ratio,
        revision: input.revision,
        pass_count: input.pass_count,
        batch_count: input.batch_count,
        command_count: input.command_count,
        submitted_command_buffer_count: input.submitted_command_buffer_count,
        frame_capture_mime_type: input
            .frame_capture
            .map(|capture| capture.mime_type.to_string()),
        frame_capture_byte_count: input
            .frame_capture
            .map(|capture| capture.bytes.len())
            .unwrap_or(0),
        frame_capture_width: input.frame_capture.map(|capture| capture.width),
        frame_capture_height: input.frame_capture.map(|capture| capture.height),
        frame_capture_png_signature_valid: input
            .frame_capture
            .is_some_and(|capture| capture.bytes.starts_with(b"\x89PNG\r\n\x1a\n")),
        frame_capture_visible_pixel_count: input
            .frame_capture
            .map(|capture| capture.visible_pixel_count)
            .unwrap_or(0),
        frame_capture_colored_pixel_count: input
            .frame_capture
            .map(|capture| capture.colored_pixel_count)
            .unwrap_or(0),
    }
}

fn lifecycle_state_label(state: NativeProductAppLifecycleState) -> &'static str {
    match state {
        NativeProductAppLifecycleState::Suspended => "suspended",
        NativeProductAppLifecycleState::Running => "running",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_report_from_window_smoke_metrics() {
        let texture_metrics = NativeWindowSmokeTextureMetrics {
            upload_last_pending_request_count: 2,
            upload_last_already_resident_count: 1,
            upload_uploaded_count: 3,
            upload_error_count: 4,
            upload_resubmit_count: 1,
            font_atlas_uploaded_count: 5,
            font_atlas_error_count: 0,
            lifecycle_sync_count: 5,
            lifecycle_initial_sync_count: 1,
            lifecycle_last_observed_bundle_count: 2,
            lifecycle_last_tracked_package_count: 3,
            lifecycle_last_blocked_package_count: 1,
            lifecycle_release_attempt_count: 4,
            lifecycle_released_package_count: 2,
            lifecycle_texture_cleanup_error_count: 1,
            shutdown_count: 1,
            shutdown_released_resource_count: 6,
            shutdown_host_cleanup_count: 5,
            shutdown_texture_released_count: 4,
            shutdown_texture_cleanup_error_count: 1,
            shutdown_video_frame_texture_uploaded_count: 2,
            shutdown_video_frame_texture_released_count: 3,
            shutdown_video_frame_texture_error_count: 1,
            shutdown_font_atlas_uploaded_count: 4,
            shutdown_font_atlas_released_count: 5,
            shutdown_font_atlas_error_count: 2,
        };
        let input_metrics = NativeWindowSmokeInputMetrics {
            pointer_event_count: 6,
            pointer_dispatch_count: 5,
            pointer_intent_emit_count: 4,
            pointer_probe_count: 1,
            pointer_cancel_count: 2,
            focus_gain_count: 1,
            focus_loss_count: 2,
            focus_intent_emit_count: 3,
            keyboard_event_count: 3,
            keyboard_press_count: 2,
            keyboard_release_count: 1,
            keyboard_repeat_count: 1,
            keyboard_intent_emit_count: 2,
            ime_event_count: 4,
            ime_enabled_count: 1,
            ime_disabled_count: 1,
            ime_preedit_count: 2,
            ime_commit_count: 1,
            ime_intent_emit_count: 3,
            ime_composition_active: true,
            ime_last_text_byte_count: Some(6),
            ime_last_cursor_start: Some(1),
            ime_last_cursor_end: Some(2),
            last_intent_type: Some("ui/intent".to_string()),
        };
        let audio_metrics = NativeWindowSmokeAudioMetrics {
            applied_plan_count: 12,
            applied_command_count: 13,
            active_track_count: 2,
            peak_active_track_count: 3,
        };
        let video_metrics = NativeWindowSmokeVideoMetrics {
            loaded_asset_count: 14,
            resident_asset_count: 1,
            applied_plan_count: 15,
            applied_command_count: 16,
            active_stream_count: 1,
            decoded_stream_count: 2,
            decode_failure_count: 3,
            missing_asset_count: 4,
            published_frame_count: 5,
            pending_frame_count: 0,
            released_texture_count: 6,
            pending_release_count: 0,
        };
        let frame_capture = RealWgpuEncodedFrameCapture {
            width: 960,
            height: 540,
            mime_type: "image/png",
            bytes: b"\x89PNG\r\n\x1a\nfixture".to_vec(),
            visible_pixel_count: 518_400,
            colored_pixel_count: 42_000,
        };

        let report = build_window_smoke_report(NativeWindowSmokeReportInput {
            adapter_name: "adapter",
            surface_format: "Bgra8Unorm",
            present_mode: "Fifo",
            present_status: "Presented",
            presented: true,
            present_attempt_count: 2,
            target_frame_count: 3,
            rendered_frame_count: 2,
            resize_count: 3,
            surface_recovery_count: 1,
            device_recovery_count: 1,
            recovery_metrics: NativeProductSurfaceRecoveryMetrics {
                present_failure_count: 2,
                recoverable_surface_failure_count: 1,
                recoverable_device_failure_count: 1,
                surface_recovery_attempt_count: 2,
                surface_recovery_success_count: 1,
                surface_recovery_missing_size_count: 1,
                surface_recovery_error_count: 0,
                device_recovery_attempt_count: 2,
                device_recovery_success_count: 1,
                device_recovery_missing_size_count: 0,
                device_recovery_error_count: 1,
                last_present_failure_kind: Some(
                    crate::product_frame_scheduler::NativeProductFramePresentFailureKind::RecoverableDevice,
                ),
                last_recovery_action: Some(
                    crate::product_frame_scheduler::NativeProductFramePresentFailureAction::RecoverDevice,
                ),
                last_surface_recovery_status: Some(
                    crate::product_frame_scheduler::NativeProductSurfaceRecoveryStatus::Reconfigured,
                ),
                last_device_recovery_status: Some(
                    crate::product_frame_scheduler::NativeProductSurfaceRecoveryStatus::DeviceRebuilt,
                ),
            },
            last_present_failure_kind: Some(NativeProductWindowPresentFailureKind::Outdated),
            texture_metrics: &texture_metrics,
            audio_metrics: &audio_metrics,
            video_metrics: &video_metrics,
            input_metrics: &input_metrics,
            app_loop: NativeProductAppLoopSnapshot {
                lifecycle_state: NativeProductAppLifecycleState::Running,
                focused: true,
                visible: true,
                redraw_pending: false,
                resume_count: 1,
                suspend_count: 0,
                visibility_change_count: 2,
                lifecycle_tick_request_count: 3,
                redraw_request_count: 4,
                continuous_rendering: false,
            },
            last_resize_physical_size: Some(NativeProductWindowPhysicalSize::new(960, 540)),
            dimensions: WindowFrameDimensions {
                logical_width: 480.0,
                logical_height: 270.0,
                physical_size: winit::dpi::PhysicalSize::new(960, 540),
                device_pixel_ratio: 2.0,
            },
            revision: 7,
            pass_count: 8,
            batch_count: 9,
            command_count: 10,
            submitted_command_buffer_count: 11,
            font_atlas_uploaded_count: 5,
            font_atlas_text_draw_count: 6,
            shaped_text_draw_count: 5,
            bitmap_text_draw_count: 0,
            font_atlas_resource_ids: vec!["fonts:Noto Sans".to_string()],
            linear_sampled_texture_bind_group_count: 4,
            nearest_sampled_texture_bind_group_count: 0,
            frame_capture: Some(&frame_capture),
        });

        assert_eq!(report.adapter_name, "adapter");
        assert_eq!(report.target_frame_count, 3);
        assert_eq!(report.rendered_frame_count, 2);
        assert_eq!(report.font_atlas_uploaded_count, 5);
        assert_eq!(report.font_atlas_text_draw_count, 6);
        assert_eq!(report.shaped_text_draw_count, 5);
        assert_eq!(report.bitmap_text_draw_count, 0);
        assert_eq!(report.font_atlas_resource_ids, vec!["fonts:Noto Sans"]);
        assert_eq!(report.linear_sampled_texture_bind_group_count, 4);
        assert_eq!(report.nearest_sampled_texture_bind_group_count, 0);
        assert_eq!(report.surface_recovery_attempt_count, 2);
        assert_eq!(report.surface_recovery_success_count, 1);
        assert_eq!(report.surface_recovery_missing_size_count, 1);
        assert_eq!(report.surface_recovery_error_count, 0);
        assert_eq!(report.device_recovery_count, 1);
        assert_eq!(report.device_recovery_attempt_count, 2);
        assert_eq!(report.device_recovery_success_count, 1);
        assert_eq!(report.device_recovery_error_count, 1);
        assert_eq!(report.present_failure_count, 2);
        assert_eq!(report.recoverable_surface_failure_count, 1);
        assert_eq!(report.recoverable_device_failure_count, 1);
        assert_eq!(
            report.last_present_failure_kind.as_deref(),
            Some("recoverable-device")
        );
        assert_eq!(
            report.last_surface_present_failure_kind.as_deref(),
            Some("outdated")
        );
        assert_eq!(
            report.last_recovery_action.as_deref(),
            Some("recover-device")
        );
        assert_eq!(
            report.last_surface_recovery_status.as_deref(),
            Some("reconfigured")
        );
        assert_eq!(
            report.last_device_recovery_status.as_deref(),
            Some("device-rebuilt")
        );
        assert_eq!(report.texture_upload_pending_request_count, 2);
        assert_eq!(report.texture_lifecycle_tracked_package_count, 3);
        assert_eq!(report.texture_shutdown_count, 1);
        assert_eq!(report.texture_shutdown_released_resource_count, 6);
        assert_eq!(report.texture_shutdown_host_cleanup_count, 5);
        assert_eq!(report.texture_shutdown_released_count, 4);
        assert_eq!(report.texture_shutdown_cleanup_error_count, 1);
        assert_eq!(
            report.texture_shutdown_video_frame_texture_uploaded_count,
            2
        );
        assert_eq!(
            report.texture_shutdown_video_frame_texture_released_count,
            3
        );
        assert_eq!(report.texture_shutdown_video_frame_texture_error_count, 1);
        assert_eq!(report.texture_shutdown_font_atlas_uploaded_count, 4);
        assert_eq!(report.texture_shutdown_font_atlas_released_count, 5);
        assert_eq!(report.texture_shutdown_font_atlas_error_count, 2);
        assert_eq!(report.audio_backend_applied_plan_count, 12);
        assert_eq!(report.audio_backend_applied_command_count, 13);
        assert_eq!(report.audio_backend_active_track_count, 2);
        assert_eq!(report.audio_backend_peak_active_track_count, 3);
        assert_eq!(report.video_backend_loaded_asset_count, 14);
        assert_eq!(report.video_backend_resident_asset_count, 1);
        assert_eq!(report.video_backend_applied_plan_count, 15);
        assert_eq!(report.video_backend_applied_command_count, 16);
        assert_eq!(report.video_backend_active_stream_count, 1);
        assert_eq!(report.video_backend_decoded_stream_count, 2);
        assert_eq!(report.video_backend_decode_failure_count, 3);
        assert_eq!(report.video_backend_missing_asset_count, 4);
        assert_eq!(report.video_backend_published_frame_count, 5);
        assert_eq!(report.video_backend_pending_frame_count, 0);
        assert_eq!(report.video_backend_released_texture_count, 6);
        assert_eq!(report.video_backend_pending_release_count, 0);
        assert_eq!(
            report.pointer_last_intent_type.as_deref(),
            Some("ui/intent")
        );
        assert_eq!(report.pointer_cancel_count, 2);
        assert_eq!(report.focus_gain_count, 1);
        assert_eq!(report.focus_loss_count, 2);
        assert_eq!(report.focus_intent_emit_count, 3);
        assert_eq!(report.keyboard_event_count, 3);
        assert_eq!(report.keyboard_press_count, 2);
        assert_eq!(report.keyboard_release_count, 1);
        assert_eq!(report.keyboard_repeat_count, 1);
        assert_eq!(report.keyboard_intent_emit_count, 2);
        assert_eq!(report.ime_event_count, 4);
        assert_eq!(report.ime_enabled_count, 1);
        assert_eq!(report.ime_disabled_count, 1);
        assert_eq!(report.ime_preedit_count, 2);
        assert_eq!(report.ime_commit_count, 1);
        assert_eq!(report.ime_intent_emit_count, 3);
        assert!(report.ime_composition_active);
        assert_eq!(report.ime_last_text_byte_count, Some(6));
        assert_eq!(report.ime_last_cursor_start, Some(1));
        assert_eq!(report.ime_last_cursor_end, Some(2));
        assert_eq!(report.app_lifecycle_state, "running");
        assert!(report.app_focused);
        assert!(report.app_visible);
        assert!(!report.app_redraw_pending);
        assert_eq!(report.app_resume_count, 1);
        assert_eq!(report.app_visibility_change_count, 2);
        assert_eq!(report.app_lifecycle_tick_request_count, 3);
        assert_eq!(report.app_redraw_request_count, 4);
        assert_eq!(report.last_resize_physical_width, Some(960));
        assert_eq!(report.logical_width, 480.0);
        assert!(report.resubmitted_after_texture_upload);
        assert_eq!(report.frame_capture_mime_type.as_deref(), Some("image/png"));
        assert_eq!(report.frame_capture_byte_count, 15);
        assert_eq!(report.frame_capture_width, Some(960));
        assert_eq!(report.frame_capture_height, Some(540));
        assert!(report.frame_capture_png_signature_valid);
        assert_eq!(report.frame_capture_visible_pixel_count, 518_400);
        assert_eq!(report.frame_capture_colored_pixel_count, 42_000);
    }
}
