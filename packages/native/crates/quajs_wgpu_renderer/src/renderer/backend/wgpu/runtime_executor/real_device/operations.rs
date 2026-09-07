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
        self.composite_groups = plan.composite_groups.clone();
        let has_blend = self
            .composite_groups
            .values()
            .flatten()
            .any(|group| group.blend_mode != crate::render_graph::CompositeBlendMode::Normal);
        let has_blurred_shadow = self.composite_groups.values().flatten().any(|group| {
            group
                .drop_shadow
                .as_ref()
                .is_some_and(|shadow| group.blur_radius.hypot(shadow.sigma) >= 0.001)
        });
        if !has_blurred_shadow {
            if let Some(compositor) = &mut self.compositor {
                compositor.clear_shadow_blur();
            }
        }
        let has_backdrop = has_blend
            || plan.operations.iter().any(|op| {
                matches!(op,
            WgpuNativeRenderRuntimeOperation::SetBindGroup { resource_ids, .. }
            if resource_ids.iter().any(|id| id == "system:backdrop-capture"))
            });
        if !has_backdrop {
            self.backdrop_texture = None;
        }
        let depth = self
            .composite_groups
            .values()
            .map(Vec::len)
            .max()
            .unwrap_or(0);
        let extent = self.target.extent();
        // The blur pyramid and two Gaussian outputs occupy at most two full
        // frame textures. Reject over-budget frames before recording GPU work.
        let bytes = (depth as u64 + u64::from(has_backdrop) + 2 * u64::from(has_blurred_shadow))
            * u64::from(extent.width)
            * u64::from(extent.height)
            * 4;
        if depth > 16 || bytes > 256 * 1024 * 1024 {
            return invalid_order(
                "native compositing exceeds its 16-level / 256 MiB transient target budget",
            );
        }
        if self.composite_groups.is_empty() {
            self.compositor = None;
        }
        if plan.render_pass_count > 0 {
            if !self.composite_groups.is_empty() && self.compositor.is_none() {
                self.compositor = Some(super::pass::composite::Compositor::new(&self.target));
            }
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
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling, optional host-provided PNG/JPEG image byte decoding into RGBA textures, deterministic placeholder fallback, uploaded-or-built-in TextAtlas sampling for TextPlaceholder draws including per-character CJK/fullwidth atlas slots, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, real text shaping, full font fallback/layout, advanced CJK typography, video decode, and audio playback remain future backend work."
        }
        #[cfg(not(feature = "image-decode"))]
        {
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling with deterministic placeholder fallback, uploaded-or-built-in TextAtlas sampling for TextPlaceholder draws including per-character CJK/fullwidth atlas slots, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, encoded image decoding, real text shaping, full font fallback/layout, advanced CJK typography, video decode, and audio playback remain future backend work."
        }
    }
}
