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
        // Every main/group target has a resolve texture plus an MSAA
        // attachment when enabled. Backdrop and blur outputs are single-sample.
        let bytes = transient_target_bytes(
            depth,
            has_backdrop,
            has_blurred_shadow,
            extent.width,
            extent.height,
            self.target.sample_count(),
        );
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

fn transient_target_bytes(
    depth: usize,
    backdrop: bool,
    blurred_shadow: bool,
    width: u32,
    height: u32,
    samples: u32,
) -> u64 {
    let attachments = 1 + if samples > 1 { u64::from(samples) } else { 0 };
    let textures = (depth as u64)
        .saturating_add(1)
        .saturating_mul(attachments)
        .saturating_add(u64::from(backdrop) + 2 * u64::from(blurred_shadow));
    textures
        .saturating_mul(u64::from(width))
        .saturating_mul(u64::from(height))
        .saturating_mul(4)
}

#[cfg(test)]
mod memory_budget_tests {
    use super::transient_target_bytes;

    #[test]
    fn counts_resolve_msaa_and_auxiliary_targets() {
        assert_eq!(
            transient_target_bytes(2, true, true, 1920, 1080, 1),
            6 * 1920 * 1080 * 4
        );
        assert_eq!(
            transient_target_bytes(2, true, true, 1920, 1080, 4),
            18 * 1920 * 1080 * 4
        );
        assert!(transient_target_bytes(2, false, false, 3840, 2160, 4) > 256 * 1024 * 1024);
        assert_eq!(
            transient_target_bytes(usize::MAX, true, true, u32::MAX, u32::MAX, 4),
            u64::MAX
        );
    }
}
