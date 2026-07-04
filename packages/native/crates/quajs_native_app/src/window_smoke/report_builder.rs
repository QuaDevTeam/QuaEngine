use winit::dpi::PhysicalSize;

use super::frame::WindowFrameDimensions;
use super::input::NativeWindowSmokeInputMetrics;
use super::metrics::NativeWindowSmokeTextureMetrics;
use super::report::NativeWindowSmokeReport;

pub(super) struct NativeWindowSmokeReportInput<'a> {
    pub adapter_name: &'a str,
    pub surface_format: &'a str,
    pub present_mode: &'a str,
    pub present_status: &'a str,
    pub presented: bool,
    pub present_attempt_count: usize,
    pub resize_count: usize,
    pub surface_recovery_count: usize,
    pub texture_metrics: &'a NativeWindowSmokeTextureMetrics,
    pub input_metrics: &'a NativeWindowSmokeInputMetrics,
    pub last_resize_physical_size: Option<PhysicalSize<u32>>,
    pub dimensions: WindowFrameDimensions,
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub submitted_command_buffer_count: usize,
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
        resize_count: input.resize_count,
        surface_recovery_count: input.surface_recovery_count,
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
        pointer_event_count: input.input_metrics.pointer_event_count,
        pointer_dispatch_count: input.input_metrics.pointer_dispatch_count,
        pointer_intent_emit_count: input.input_metrics.pointer_intent_emit_count,
        pointer_probe_count: input.input_metrics.pointer_probe_count,
        pointer_last_intent_type: input.input_metrics.last_intent_type.clone(),
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
            lifecycle_sync_count: 5,
            lifecycle_initial_sync_count: 1,
            lifecycle_last_observed_bundle_count: 2,
            lifecycle_last_tracked_package_count: 3,
            lifecycle_last_blocked_package_count: 1,
            lifecycle_release_attempt_count: 4,
            lifecycle_released_package_count: 2,
            lifecycle_texture_cleanup_error_count: 1,
        };
        let input_metrics = NativeWindowSmokeInputMetrics {
            pointer_event_count: 6,
            pointer_dispatch_count: 5,
            pointer_intent_emit_count: 4,
            pointer_probe_count: 1,
            last_intent_type: Some("ui/intent".to_string()),
        };

        let report = build_window_smoke_report(NativeWindowSmokeReportInput {
            adapter_name: "adapter",
            surface_format: "Bgra8Unorm",
            present_mode: "Fifo",
            present_status: "Presented",
            presented: true,
            present_attempt_count: 2,
            resize_count: 3,
            surface_recovery_count: 1,
            texture_metrics: &texture_metrics,
            input_metrics: &input_metrics,
            last_resize_physical_size: Some(PhysicalSize::new(960, 540)),
            dimensions: WindowFrameDimensions {
                logical_width: 480.0,
                logical_height: 270.0,
                physical_size: PhysicalSize::new(960, 540),
                device_pixel_ratio: 2.0,
            },
            revision: 7,
            pass_count: 8,
            batch_count: 9,
            command_count: 10,
            submitted_command_buffer_count: 11,
        });

        assert_eq!(report.adapter_name, "adapter");
        assert_eq!(report.texture_upload_pending_request_count, 2);
        assert_eq!(report.texture_lifecycle_tracked_package_count, 3);
        assert_eq!(
            report.pointer_last_intent_type.as_deref(),
            Some("ui/intent")
        );
        assert_eq!(report.last_resize_physical_width, Some(960));
        assert_eq!(report.logical_width, 480.0);
        assert!(report.resubmitted_after_texture_upload);
    }
}
