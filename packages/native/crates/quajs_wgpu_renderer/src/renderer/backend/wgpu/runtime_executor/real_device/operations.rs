mod dispatch;

use super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeSnapshot,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
};
use dispatch::apply_real_runtime_operation;

impl WgpuNativeRenderRuntimeDevice for RealWgpuNativeRenderRuntimeDevice {
    fn begin_runtime_plan(
        &mut self,
        plan: &WgpuNativeRenderRuntimePlan,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if plan.render_pass_count > 0 {
            self.frame_target.begin_frame(&self.target);
        }
        Ok(())
    }

    fn apply_runtime_operation(
        &mut self,
        operation: &WgpuNativeRenderRuntimeOperation,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        apply_real_runtime_operation(self, operation, report)
    }

    fn finish_runtime_plan(&mut self) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self
            .active_encoder
            .as_ref()
            .and_then(|encoder| encoder.active_pass.as_ref())
            .is_some()
        {
            return invalid_order("runtime plan finished with an open render pass");
        }
        if self.active_encoder.is_some() {
            return invalid_order("runtime plan finished with an open command encoder");
        }
        Ok(())
    }

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.snapshot()
    }

    fn device_attached(&self) -> bool {
        true
    }

    fn diagnostic_note(&self) -> &'static str {
        #[cfg(feature = "image-decode")]
        {
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling, optional host-provided PNG/JPEG image byte decoding into RGBA textures, deterministic placeholder fallback, built-in bitmap TextAtlas sampling for TextPlaceholder draws, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, real font shaping/fallback/font asset rasterization, video decode, and audio playback remain future backend work."
        }
        #[cfg(not(feature = "image-decode"))]
        {
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling with deterministic placeholder fallback, built-in bitmap TextAtlas sampling for TextPlaceholder draws, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, encoded image decoding, real font shaping/fallback/font asset rasterization, video decode, and audio playback remain future backend work."
        }
    }
}
