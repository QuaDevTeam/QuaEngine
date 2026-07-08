use quajs_native_runtime::InMemoryNativeHostApi;
use quajs_wgpu_renderer::audio::{NativeAudioBackendError, NullNativeAudioBackend};
use quajs_wgpu_renderer::renderer::{
    configure_wgpu_surface_for_native_renderer, create_real_wgpu_surface_target,
    InMemoryWgpuNativeRenderRuntimeExecutor, NativeRenderer, RealWgpuNativeRenderRuntimeDevice,
    RealWgpuSurfacePresentReport, RealWgpuSurfaceTargetBootstrapRequest, WgpuNativeRenderBackend,
    WgpuNativeRenderBackendConfig, WgpuNativeRenderRuntimeError, WgpuNativeSurfaceConfigRequest,
};
use winit::dpi::PhysicalSize;

use crate::product_loop::NativeProductLoopFrameResult;
use crate::product_runtime::NativeProductRuntime;
use crate::texture_sync::{NativeTextureCleanedClearResult, NativeTextureJsonLifecycleFrameError};

use super::error::NativeWindowSmokeError;

type RealWgpuBackend = WgpuNativeRenderBackend<
    InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
>;

pub(super) type RealWgpuRenderer = NativeRenderer<RealWgpuBackend, NullNativeAudioBackend>;

type RealWgpuProductRuntime =
    NativeProductRuntime<RealWgpuBackend, NullNativeAudioBackend, InMemoryNativeHostApi>;

pub(super) struct NativeWindowSmokeRuntime {
    pub(super) surface: wgpu::Surface<'static>,
    product: RealWgpuProductRuntime,
    adapter: wgpu::Adapter,
    backend_config: WgpuNativeRenderBackendConfig,
    pub(super) adapter_name: String,
    pub(super) surface_format: String,
    pub(super) present_mode: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeResizeReport {
    pub physical_width: u32,
    pub physical_height: u32,
}

impl NativeWindowSmokeRuntime {
    pub(super) fn bootstrap(
        instance: &wgpu::Instance,
        surface: wgpu::Surface<'static>,
        physical_size: PhysicalSize<u32>,
        host: InMemoryNativeHostApi,
    ) -> Result<Self, NativeWindowSmokeError> {
        let backend_config = WgpuNativeRenderBackendConfig::default();
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
            NativeWindowSmokeError::new(format!(
                "Failed to bootstrap native renderer smoke wgpu target: {error}."
            ))
        })?;

        let runtime_device = RealWgpuNativeRenderRuntimeDevice::new(bootstrap.target);
        let runtime_executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(runtime_device);
        let backend = WgpuNativeRenderBackend::with_runtime_executor(
            backend_config.clone(),
            runtime_executor,
        );

        Ok(Self {
            surface,
            product: NativeProductRuntime::new(
                NativeRenderer::with_null_audio_backend(backend),
                host,
            ),
            adapter: bootstrap.adapter,
            backend_config,
            adapter_name: bootstrap.adapter_info.name,
            surface_format: format!("{:?}", bootstrap.surface_config.config.format),
            present_mode: format!("{:?}", bootstrap.surface_config.config.present_mode),
        })
    }

    pub(super) fn rendered_frame_count(&self) -> usize {
        self.product.rendered_frame_count()
    }

    pub(super) fn renderer(&self) -> &RealWgpuRenderer {
        self.product.renderer()
    }

    pub(super) fn renderer_mut(&mut self) -> &mut RealWgpuRenderer {
        self.product.renderer_mut()
    }

    pub(super) fn renderer_and_host_mut(
        &mut self,
    ) -> (&mut RealWgpuRenderer, &mut InMemoryNativeHostApi) {
        self.product.renderer_and_host_mut()
    }

    pub(super) fn host_mut(&mut self) -> &mut InMemoryNativeHostApi {
        self.product.host_mut()
    }

    pub(super) fn render_projection_json_with_audio_teardown(
        &mut self,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError> {
        self.product
            .render_projection_json_with_audio_teardown(input)
    }

    pub(super) fn shutdown_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureCleanedClearResult, NativeAudioBackendError> {
        self.product.shutdown_with_audio_teardown()
    }

    pub(super) fn present_frame_to_surface(
        &mut self,
    ) -> Result<RealWgpuSurfacePresentReport, WgpuNativeRenderRuntimeError> {
        self.product
            .renderer_mut()
            .backend_mut()
            .present_frame_to_surface(&self.surface)
    }

    pub(super) fn resize_to_physical_size(
        &mut self,
        physical_size: PhysicalSize<u32>,
    ) -> Result<NativeWindowSmokeResizeReport, NativeWindowSmokeError> {
        let surface_config_request = WgpuNativeSurfaceConfigRequest::from_backend_config(
            physical_size.width,
            physical_size.height,
            &self.backend_config,
        )
        .map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to plan native renderer smoke surface resize request: {error}."
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
                NativeWindowSmokeError::new(format!(
                    "Failed to configure native renderer smoke surface resize: {error}."
                ))
            })?
        };
        self.renderer_mut()
            .backend_mut()
            .resize_target_from_surface_config(&surface_config)
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to resize native renderer smoke wgpu target: {error}."
                ))
            })?;

        self.surface_format = format!("{:?}", surface_config.config.format);
        self.present_mode = format!("{:?}", surface_config.config.present_mode);

        Ok(NativeWindowSmokeResizeReport {
            physical_width: surface_config.config.width,
            physical_height: surface_config.config.height,
        })
    }
}
