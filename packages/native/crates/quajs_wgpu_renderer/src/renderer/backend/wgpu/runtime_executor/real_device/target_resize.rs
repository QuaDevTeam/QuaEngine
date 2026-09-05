use super::frame_target::RealRuntimeFrameTarget;
use super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::WgpuNativeSurfaceConfigPlan;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RealWgpuTargetResizeReport {
    pub previous_extent: wgpu::Extent3d,
    pub new_extent: wgpu::Extent3d,
    pub previous_color_format: wgpu::TextureFormat,
    pub new_color_format: wgpu::TextureFormat,
    pub pipelines_cleared: usize,
    pub bind_groups_cleared: usize,
}

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn resize_target_from_surface_config(
        &mut self,
        surface_config: &WgpuNativeSurfaceConfigPlan,
    ) -> Result<RealWgpuTargetResizeReport, WgpuNativeRenderRuntimeError> {
        self.resize_target(
            surface_config.config.format,
            wgpu::Extent3d {
                width: surface_config.config.width,
                height: surface_config.config.height,
                depth_or_array_layers: 1,
            },
        )
    }

    pub fn resize_target(
        &mut self,
        color_format: wgpu::TextureFormat,
        extent: wgpu::Extent3d,
    ) -> Result<RealWgpuTargetResizeReport, WgpuNativeRenderRuntimeError> {
        if self.active_encoder.is_some() {
            return invalid_order(
                "cannot resize real-wgpu target while a command encoder is active",
            );
        }

        let previous_extent = self.target.extent();
        let previous_color_format = self.target.color_format();
        self.target.resize(color_format, extent);
        self.uniforms = self.uniforms.resized(&self.target);
        self.frame_target = RealRuntimeFrameTarget::new(&self.target);
        self.compositor = None;
        self.backdrop_texture = None;

        let mut pipelines_cleared = 0;
        let mut bind_groups_cleared = 0;
        if previous_color_format != self.target.color_format() {
            pipelines_cleared = self.pipelines.len();
            bind_groups_cleared = self.bind_groups.len();
            self.pipelines.clear();
            self.bind_groups.clear();
        }

        Ok(RealWgpuTargetResizeReport {
            previous_extent,
            new_extent: self.target.extent(),
            previous_color_format,
            new_color_format: self.target.color_format(),
            pipelines_cleared,
            bind_groups_cleared,
        })
    }
}
