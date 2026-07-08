use quajs_wgpu_renderer::renderer::RealWgpuSurfacePresentReport;

use super::bootstrap::NativeWindowSmokeRuntime;
use super::error::NativeWindowSmokeError;

pub(super) struct NativeWindowSmokePresentOutcome {
    pub present_status: String,
    pub presented: bool,
    pub submitted_command_buffer_count: usize,
}

pub(super) fn present_window_smoke_frame(
    runtime: &mut NativeWindowSmokeRuntime,
    allow_occluded_report: bool,
) -> Result<NativeWindowSmokePresentOutcome, NativeWindowSmokeError> {
    let offscreen_submitted_command_buffer_count = runtime
        .renderer()
        .backend()
        .runtime_snapshot()
        .submitted_command_buffer_count;
    let present_report = match runtime.present_frame_to_surface() {
        Ok(report) => Some(report),
        Err(error) => {
            let error = NativeWindowSmokeError::new(format!(
                "Native renderer smoke surface present failed: {error}."
            ));
            if allow_occluded_report && is_occluded_or_timeout_present_error(&error) {
                None
            } else {
                return Err(error);
            }
        }
    };

    Ok(present_outcome_from_report(
        present_report,
        offscreen_submitted_command_buffer_count,
    ))
}

pub(super) fn present_status(present_report: &Option<RealWgpuSurfacePresentReport>) -> String {
    present_report
        .as_ref()
        .map(|report| format!("{:?}", report.status))
        .unwrap_or_else(|| "OccludedAfterRetry".to_string())
}

pub(super) fn is_occluded_or_timeout_present_error(error: &NativeWindowSmokeError) -> bool {
    let message = error.to_string();
    message.contains("surface is occluded") || message.contains("surface acquisition timed out")
}

pub(super) fn is_recoverable_surface_present_error(error: &NativeWindowSmokeError) -> bool {
    let message = error.to_string();
    message.contains("surface was lost") || message.contains("surface configuration is outdated")
}

fn present_outcome_from_report(
    present_report: Option<RealWgpuSurfacePresentReport>,
    offscreen_submitted_command_buffer_count: usize,
) -> NativeWindowSmokePresentOutcome {
    let present_status = present_status(&present_report);
    let presented = present_report.is_some();
    let submitted_command_buffer_count = present_report
        .as_ref()
        .map(|report| report.copy.submitted_command_buffer_count)
        .unwrap_or(offscreen_submitted_command_buffer_count);

    NativeWindowSmokePresentOutcome {
        present_status,
        presented,
        submitted_command_buffer_count,
    }
}

#[cfg(test)]
mod tests {
    use quajs_wgpu_renderer::renderer::{RealWgpuFrameCopyReport, RealWgpuSurfacePresentStatus};

    use super::*;

    #[test]
    fn present_outcome_uses_surface_copy_count_when_presented() {
        let outcome = present_outcome_from_report(
            Some(RealWgpuSurfacePresentReport {
                copy: RealWgpuFrameCopyReport {
                    extent: wgpu::Extent3d {
                        width: 960,
                        height: 540,
                        depth_or_array_layers: 1,
                    },
                    color_format: wgpu::TextureFormat::Bgra8UnormSrgb,
                    submitted_command_buffer_count: 4,
                },
                status: RealWgpuSurfacePresentStatus::Presented,
            }),
            3,
        );

        assert_eq!(outcome.present_status, "Presented");
        assert!(outcome.presented);
        assert_eq!(outcome.submitted_command_buffer_count, 4);
    }

    #[test]
    fn present_outcome_falls_back_to_offscreen_count_when_occluded() {
        let outcome = present_outcome_from_report(None, 3);

        assert_eq!(outcome.present_status, "OccludedAfterRetry");
        assert!(!outcome.presented);
        assert_eq!(outcome.submitted_command_buffer_count, 3);
    }
}
