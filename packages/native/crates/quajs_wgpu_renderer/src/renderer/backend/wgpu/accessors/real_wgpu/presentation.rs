use super::super::super::{
    InMemoryWgpuNativeRenderRuntimeExecutor, RealWgpuFrameCopyReport,
    RealWgpuNativeRenderRuntimeDevice, RealWgpuSurfacePresentReport, RealWgpuTargetResizeReport,
    WgpuNativeRenderBackend, WgpuNativeRenderRuntimeError, WgpuNativeSurfaceConfigPlan,
};

impl
    WgpuNativeRenderBackend<
        InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
    >
{
    pub fn copy_frame_to_texture(
        &mut self,
        destination: &wgpu::Texture,
    ) -> Result<RealWgpuFrameCopyReport, WgpuNativeRenderRuntimeError> {
        self.runtime_executor_mut()
            .device_mut()
            .copy_frame_to_texture(destination)
    }

    pub fn present_frame_to_surface_texture(
        &mut self,
        surface_texture: wgpu::SurfaceTexture,
    ) -> Result<RealWgpuFrameCopyReport, WgpuNativeRenderRuntimeError> {
        self.runtime_executor_mut()
            .device_mut()
            .present_frame_to_surface_texture(surface_texture)
    }

    pub fn present_frame_to_surface(
        &mut self,
        surface: &wgpu::Surface<'_>,
    ) -> Result<RealWgpuSurfacePresentReport, WgpuNativeRenderRuntimeError> {
        self.runtime_executor_mut()
            .device_mut()
            .present_frame_to_surface(surface)
    }

    pub fn resize_target_from_surface_config(
        &mut self,
        surface_config: &WgpuNativeSurfaceConfigPlan,
    ) -> Result<RealWgpuTargetResizeReport, WgpuNativeRenderRuntimeError> {
        self.runtime_executor_mut()
            .device_mut()
            .resize_target_from_surface_config(surface_config)
    }

    pub fn resize_target(
        &mut self,
        color_format: wgpu::TextureFormat,
        extent: wgpu::Extent3d,
    ) -> Result<RealWgpuTargetResizeReport, WgpuNativeRenderRuntimeError> {
        self.runtime_executor_mut()
            .device_mut()
            .resize_target(color_format, extent)
    }
}
