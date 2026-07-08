use std::fmt::{Display, Formatter};

use quajs_native_runtime::{InMemoryNativeHostApi, NativeHostApi};
use quajs_wgpu_renderer::audio::{NativeAudioBackendError, NullNativeAudioBackend};
use quajs_wgpu_renderer::renderer::{
    configure_wgpu_surface_for_native_renderer, create_real_wgpu_surface_target,
    InMemoryWgpuNativeRenderRuntimeExecutor, NativeRenderer, RealWgpuNativeRenderRuntimeDevice,
    RealWgpuSurfacePresentReport, RealWgpuSurfaceTargetBootstrapRequest, WgpuNativeRenderBackend,
    WgpuNativeRenderBackendConfig, WgpuNativeRenderRuntimeError, WgpuNativeSurfaceConfigRequest,
};

use crate::product_frame_scheduler::NativeProductFramePresentFailureKind;
use crate::product_loop::NativeProductLoopFrameResult;
use crate::product_runtime::NativeProductRuntime;
use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureCleanedClearResult, NativeTextureJsonLifecycleFrameError,
};

pub(crate) type NativeProductWindowBackend = WgpuNativeRenderBackend<
    InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
>;

pub(crate) type NativeProductWindowRenderer =
    NativeRenderer<NativeProductWindowBackend, NullNativeAudioBackend>;

pub(crate) type NativeProductWindowInMemoryRuntime =
    NativeProductWindowRuntime<InMemoryNativeHostApi>;

type RealWgpuProductRuntime<H> =
    NativeProductRuntime<NativeProductWindowBackend, NullNativeAudioBackend, H>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductWindowPhysicalSize {
    pub(crate) width: u32,
    pub(crate) height: u32,
}

impl NativeProductWindowPhysicalSize {
    pub(crate) fn new(width: u32, height: u32) -> Self {
        Self {
            width: width.max(1),
            height: height.max(1),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductWindowPresentation {
    pub(crate) adapter_name: String,
    pub(crate) surface_format: String,
    pub(crate) present_mode: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductWindowPresentOutcome {
    pub(crate) present_status: &'static str,
    pub(crate) presented: bool,
    pub(crate) submitted_command_buffer_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductWindowResizeReport {
    pub(crate) physical_size: NativeProductWindowPhysicalSize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeProductWindowResizeState {
    count: usize,
    last_physical_size: Option<NativeProductWindowPhysicalSize>,
}

impl NativeProductWindowResizeState {
    pub(crate) fn count(&self) -> usize {
        self.count
    }

    pub(crate) fn last_physical_size(&self) -> Option<NativeProductWindowPhysicalSize> {
        self.last_physical_size
    }

    pub(crate) fn record_resize(&mut self, report: NativeProductWindowResizeReport) {
        self.count = self.count.saturating_add(1);
        self.last_physical_size = Some(report.physical_size);
    }
}

#[derive(Debug)]
pub(crate) struct NativeProductWindowError {
    message: String,
}

impl NativeProductWindowError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for NativeProductWindowError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeProductWindowError {}

#[derive(Debug)]
pub(crate) struct NativeProductWindowRuntime<H> {
    surface: wgpu::Surface<'static>,
    product: RealWgpuProductRuntime<H>,
    adapter: wgpu::Adapter,
    backend_config: WgpuNativeRenderBackendConfig,
    presentation: NativeProductWindowPresentation,
}

impl<H> NativeProductWindowRuntime<H>
where
    H: NativeHostApi,
{
    pub(crate) fn bootstrap(
        instance: &wgpu::Instance,
        surface: wgpu::Surface<'static>,
        physical_size: NativeProductWindowPhysicalSize,
        host: H,
    ) -> Result<Self, NativeProductWindowError> {
        let backend_config = WgpuNativeRenderBackendConfig::default();
        Self::bootstrap_with_backend_config(instance, surface, physical_size, host, backend_config)
    }

    pub(crate) fn bootstrap_with_backend_config(
        instance: &wgpu::Instance,
        surface: wgpu::Surface<'static>,
        physical_size: NativeProductWindowPhysicalSize,
        host: H,
        backend_config: WgpuNativeRenderBackendConfig,
    ) -> Result<Self, NativeProductWindowError> {
        let bootstrap_request = RealWgpuSurfaceTargetBootstrapRequest::new(
            physical_size.width,
            physical_size.height,
            backend_config.clone(),
        );
        let bootstrap = pollster::block_on(create_real_wgpu_surface_target(
            instance,
            &surface,
            &bootstrap_request,
        ))
        .map_err(|error| {
            NativeProductWindowError::new(format!(
                "failed to bootstrap native product window wgpu target: {error}"
            ))
        })?;

        let runtime_device = RealWgpuNativeRenderRuntimeDevice::new(bootstrap.target);
        let runtime_executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(runtime_device);
        let backend = WgpuNativeRenderBackend::with_runtime_executor(
            backend_config.clone(),
            runtime_executor,
        );
        let presentation = NativeProductWindowPresentation {
            adapter_name: bootstrap.adapter_info.name,
            surface_format: format!("{:?}", bootstrap.surface_config.config.format),
            present_mode: format!("{:?}", bootstrap.surface_config.config.present_mode),
        };

        Ok(Self {
            surface,
            product: NativeProductRuntime::new(
                NativeRenderer::with_null_audio_backend(backend),
                host,
            ),
            adapter: bootstrap.adapter,
            backend_config,
            presentation,
        })
    }

    pub(crate) fn presentation(&self) -> &NativeProductWindowPresentation {
        &self.presentation
    }

    pub(crate) fn rendered_frame_count(&self) -> usize {
        self.product.rendered_frame_count()
    }

    pub(crate) fn renderer(&self) -> &NativeProductWindowRenderer {
        self.product.renderer()
    }

    pub(crate) fn renderer_mut(&mut self) -> &mut NativeProductWindowRenderer {
        self.product.renderer_mut()
    }

    pub(crate) fn renderer_and_host_mut(&mut self) -> (&mut NativeProductWindowRenderer, &mut H) {
        self.product.renderer_and_host_mut()
    }

    pub(crate) fn host_mut(&mut self) -> &mut H {
        self.product.host_mut()
    }

    pub(crate) fn render_projection_json_with_audio_teardown(
        &mut self,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError> {
        self.product
            .render_projection_json_with_audio_teardown(input)
    }

    pub(crate) fn tick_host_lifecycle_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeTextureBundleLifecycleSyncError> {
        self.product.tick_host_lifecycle_with_audio_teardown()
    }

    pub(crate) fn shutdown_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureCleanedClearResult, NativeAudioBackendError> {
        self.product.shutdown_with_audio_teardown()
    }

    pub(crate) fn present_frame(
        &mut self,
        allow_occluded_report: bool,
    ) -> Result<NativeProductWindowPresentOutcome, NativeProductWindowError> {
        let offscreen_submitted_command_buffer_count = self
            .renderer()
            .backend()
            .runtime_snapshot()
            .submitted_command_buffer_count;
        let present_report = match self.present_frame_to_surface() {
            Ok(report) => Some(report),
            Err(error) => {
                let error = NativeProductWindowError::new(format!(
                    "native product window surface present failed: {error}"
                ));
                if allow_occluded_report
                    && is_occluded_or_timeout_present_error_message(&error.to_string())
                {
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

    pub(crate) fn present_frame_to_surface(
        &mut self,
    ) -> Result<RealWgpuSurfacePresentReport, WgpuNativeRenderRuntimeError> {
        self.product
            .renderer_mut()
            .backend_mut()
            .present_frame_to_surface(&self.surface)
    }

    pub(crate) fn resize_to_physical_size(
        &mut self,
        physical_size: NativeProductWindowPhysicalSize,
    ) -> Result<NativeProductWindowResizeReport, NativeProductWindowError> {
        let surface_config_request = WgpuNativeSurfaceConfigRequest::from_backend_config(
            physical_size.width,
            physical_size.height,
            &self.backend_config,
        )
        .map_err(|error| {
            NativeProductWindowError::new(format!(
                "failed to plan native product window surface resize request: {error}"
            ))
        })?;
        let surface_config = {
            let device = self
                .renderer()
                .backend()
                .runtime_executor()
                .device()
                .target()
                .device();
            configure_wgpu_surface_for_native_renderer(
                &self.surface,
                &self.adapter,
                device,
                &surface_config_request,
            )
            .map_err(|error| {
                NativeProductWindowError::new(format!(
                    "failed to configure native product window surface resize: {error}"
                ))
            })?
        };
        self.renderer_mut()
            .backend_mut()
            .resize_target_from_surface_config(&surface_config)
            .map_err(|error| {
                NativeProductWindowError::new(format!(
                    "failed to resize native product window wgpu target: {error}"
                ))
            })?;

        self.presentation.surface_format = format!("{:?}", surface_config.config.format);
        self.presentation.present_mode = format!("{:?}", surface_config.config.present_mode);

        Ok(NativeProductWindowResizeReport {
            physical_size: NativeProductWindowPhysicalSize::new(
                surface_config.config.width,
                surface_config.config.height,
            ),
        })
    }
}

pub(crate) fn is_occluded_or_timeout_present_error_message(message: &str) -> bool {
    message.contains("surface is occluded") || message.contains("surface acquisition timed out")
}

pub(crate) fn is_recoverable_surface_present_error_message(message: &str) -> bool {
    message.contains("surface was lost") || message.contains("surface configuration is outdated")
}

pub(crate) fn present_failure_kind_from_message(
    message: &str,
) -> NativeProductFramePresentFailureKind {
    if is_occluded_or_timeout_present_error_message(message) {
        return NativeProductFramePresentFailureKind::OccludedOrTimedOut;
    }
    if is_recoverable_surface_present_error_message(message) {
        return NativeProductFramePresentFailureKind::RecoverableSurface;
    }
    NativeProductFramePresentFailureKind::Fatal
}

fn present_outcome_from_report(
    present_report: Option<RealWgpuSurfacePresentReport>,
    offscreen_submitted_command_buffer_count: usize,
) -> NativeProductWindowPresentOutcome {
    let present_status = present_report
        .as_ref()
        .map(|report| match report.status {
            quajs_wgpu_renderer::renderer::RealWgpuSurfacePresentStatus::Presented => "Presented",
            quajs_wgpu_renderer::renderer::RealWgpuSurfacePresentStatus::Suboptimal => "Suboptimal",
        })
        .unwrap_or("OccludedAfterRetry");
    let presented = present_report.is_some();
    let submitted_command_buffer_count = present_report
        .as_ref()
        .map(|report| report.copy.submitted_command_buffer_count)
        .unwrap_or(offscreen_submitted_command_buffer_count);

    NativeProductWindowPresentOutcome {
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
    fn physical_size_normalizes_zero_dimensions() {
        assert_eq!(
            NativeProductWindowPhysicalSize::new(0, 0),
            NativeProductWindowPhysicalSize {
                width: 1,
                height: 1,
            }
        );
    }

    #[test]
    fn resize_state_records_count_and_last_physical_size() {
        let mut state = NativeProductWindowResizeState::default();

        state.record_resize(NativeProductWindowResizeReport {
            physical_size: NativeProductWindowPhysicalSize::new(800, 600),
        });
        state.record_resize(NativeProductWindowResizeReport {
            physical_size: NativeProductWindowPhysicalSize::new(1280, 720),
        });

        assert_eq!(state.count(), 2);
        assert_eq!(
            state.last_physical_size(),
            Some(NativeProductWindowPhysicalSize::new(1280, 720))
        );
    }

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

    #[test]
    fn classifies_surface_present_failures_without_smoke_error_types() {
        assert_eq!(
            present_failure_kind_from_message(
                "InvalidOperationOrder: cannot present frame because surface is occluded."
            ),
            NativeProductFramePresentFailureKind::OccludedOrTimedOut
        );
        assert_eq!(
            present_failure_kind_from_message(
                "InvalidOperationOrder: cannot present frame because surface was lost."
            ),
            NativeProductFramePresentFailureKind::RecoverableSurface
        );
        assert_eq!(
            present_failure_kind_from_message("native product window frame failed validation"),
            NativeProductFramePresentFailureKind::Fatal
        );
    }
}
