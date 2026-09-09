use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::resources::ResourceId;

use super::super::execution::{
    WgpuNativeRenderExecutionOperation, WgpuNativeRenderExecutionPass,
    WgpuNativeRenderExecutionPlan,
};
use super::super::physical::WgpuPhysicalRect;
use super::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPrimitivePlan {
    pub revision: u64,
    pub pass_count: usize,
    pub primitive_count: usize,
    pub skipped_draw_count: usize,
    pub visible_primitive_count: usize,
    pub passes: Vec<WgpuNativeRenderPrimitivePass>,
}

impl WgpuNativeRenderPrimitivePlan {
    pub fn from_execution_plan(execution_plan: &WgpuNativeRenderExecutionPlan) -> Self {
        let passes = execution_plan
            .passes
            .iter()
            .map(WgpuNativeRenderPrimitivePass::from_execution_pass)
            .collect::<Vec<_>>();
        let primitive_count = passes.iter().map(|pass| pass.primitive_count).sum();
        let skipped_draw_count = passes.iter().map(|pass| pass.skipped_draw_count).sum();
        let visible_primitive_count = passes.iter().map(|pass| pass.visible_primitive_count).sum();

        Self {
            revision: execution_plan.revision,
            pass_count: execution_plan.pass_count,
            primitive_count,
            skipped_draw_count,
            visible_primitive_count,
            passes,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderPrimitivePass {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: WgpuPhysicalRect,
    pub primitive_count: usize,
    pub skipped_draw_count: usize,
    pub visible_primitive_count: usize,
    pub primitives: Vec<WgpuNativeRenderPrimitive>,
}

impl WgpuNativeRenderPrimitivePass {
    fn from_execution_pass(pass: &WgpuNativeRenderExecutionPass) -> Self {
        let mut scissor_stack = Vec::<WgpuPhysicalRect>::new();
        let mut bound_resources = None::<PendingBoundResources>;
        let mut primitives = Vec::new();
        for operation in &pass.operations {
            match operation {
                WgpuNativeRenderExecutionOperation::SetScissor {
                    physical_rect,
                    depth,
                    ..
                } => {
                    scissor_stack.truncate(depth.saturating_sub(1));
                    scissor_stack.push(*physical_rect);
                }
                WgpuNativeRenderExecutionOperation::ClearScissor { depth } => {
                    scissor_stack.truncate(depth.saturating_sub(1));
                }
                WgpuNativeRenderExecutionOperation::BindResources {
                    command_id,
                    pipeline,
                    resources,
                } => {
                    bound_resources = Some(PendingBoundResources {
                        command_id: command_id.clone(),
                        pipeline: *pipeline,
                        resource_ids: resources
                            .iter()
                            .map(|resource| resource.resource_id.clone())
                            .collect(),
                    });
                }
                WgpuNativeRenderExecutionOperation::Draw {
                    command_id,
                    pipeline,
                    physical_bounds,
                    ..
                } => {
                    let scissor = active_scissor(&scissor_stack)
                        .map(|rect| intersect_rect(rect, *physical_bounds));
                    let resource_ids =
                        take_bound_resource_ids(&mut bound_resources, command_id, *pipeline);
                    if let Some(primitive) = WgpuNativeRenderPrimitive::from_execution_operation(
                        operation,
                        scissor,
                        resource_ids,
                        &pass.viewport,
                    ) {
                        primitives.push(primitive);
                    }
                }
                _ => {
                    if let Some(primitive) = WgpuNativeRenderPrimitive::from_execution_operation(
                        operation,
                        None,
                        None,
                        &pass.viewport,
                    ) {
                        primitives.push(primitive);
                    }
                }
            }
        }
        let primitive_count = primitives.len();
        let skipped_draw_count = primitives
            .iter()
            .filter(|primitive| {
                matches!(
                    primitive.kind,
                    WgpuNativeRenderPrimitiveKind::Skipped { .. }
                )
            })
            .count();
        let visible_primitive_count = primitives
            .iter()
            .filter(|primitive| primitive.is_visible())
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.physical_viewport,
            primitive_count,
            skipped_draw_count,
            visible_primitive_count,
            primitives,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct PendingBoundResources {
    command_id: String,
    pipeline: DrawBatchPipeline,
    resource_ids: Vec<ResourceId>,
}

fn take_bound_resource_ids(
    bound_resources: &mut Option<PendingBoundResources>,
    command_id: &str,
    pipeline: DrawBatchPipeline,
) -> Option<Vec<ResourceId>> {
    let pending = bound_resources.take()?;
    (pending.command_id == command_id && pending.pipeline == pipeline)
        .then_some(pending.resource_ids)
}

fn active_scissor(stack: &[WgpuPhysicalRect]) -> Option<WgpuPhysicalRect> {
    stack.iter().copied().reduce(intersect_rect)
}

fn intersect_rect(left: WgpuPhysicalRect, right: WgpuPhysicalRect) -> WgpuPhysicalRect {
    let x = left.x.max(right.x);
    let y = left.y.max(right.y);
    let right_edge = rect_right(left).min(rect_right(right));
    let bottom_edge = rect_bottom(left).min(rect_bottom(right));
    if right_edge <= x as u64 || bottom_edge <= y as u64 {
        return WgpuPhysicalRect {
            x,
            y,
            width: 0,
            height: 0,
        };
    }

    WgpuPhysicalRect {
        x,
        y,
        width: (right_edge - x as u64).min(u32::MAX as u64) as u32,
        height: (bottom_edge - y as u64).min(u32::MAX as u64) as u32,
    }
}

fn rect_right(rect: WgpuPhysicalRect) -> u64 {
    rect.x as u64 + rect.width as u64
}

fn rect_bottom(rect: WgpuPhysicalRect) -> u64 {
    rect.y as u64 + rect.height as u64
}
