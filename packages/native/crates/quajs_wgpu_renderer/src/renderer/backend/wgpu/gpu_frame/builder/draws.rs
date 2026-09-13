use super::super::super::pipeline::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderPipelineOperation,
    WgpuNativeRenderPipelinePass, WgpuNativeRenderResourceBindGroup,
};
use super::super::{WgpuNativeRenderGpuDrawBatch, WgpuNativeRenderGpuSkippedDraw};

pub(super) fn gpu_draw_batches_for_pass(
    pipeline_pass: &WgpuNativeRenderPipelinePass,
) -> (
    Vec<WgpuNativeRenderGpuDrawBatch>,
    Vec<WgpuNativeRenderGpuSkippedDraw>,
) {
    let mut active_bind_group: Option<WgpuNativeRenderResourceBindGroup> = None;
    let mut draw_batches = Vec::new();
    let mut skipped_draws = Vec::new();
    for operation in &pipeline_pass.operations {
        match operation {
            WgpuNativeRenderPipelineOperation::BindResourceGroup { group } => {
                active_bind_group = Some(group.clone());
            }
            WgpuNativeRenderPipelineOperation::DrawIndexed {
                command_id,
                key,
                first_index,
                index_count,
                first_vertex,
                vertex_count,
                physical_bounds,
                scissor,
            } => {
                draw_batches.push(WgpuNativeRenderGpuDrawBatch {
                    command_id: command_id.clone(),
                    key: key.clone(),
                    bind_group: drawable_bind_group(active_bind_group.as_ref()),
                    first_index: *first_index,
                    index_count: *index_count,
                    first_vertex: *first_vertex,
                    vertex_count: *vertex_count,
                    physical_bounds: *physical_bounds,
                    scissor: *scissor,
                });
                active_bind_group = None;
            }
            WgpuNativeRenderPipelineOperation::SkipDraw {
                command_id,
                reason,
                resource_ids,
                owner_package_id,
                required_package_ids,
            } => {
                skipped_draws.push(WgpuNativeRenderGpuSkippedDraw {
                    command_id: command_id.clone(),
                    reason: reason.clone(),
                    resource_ids: resource_ids.clone(),
                    owner_package_id: owner_package_id.clone(),
                    required_package_ids: required_package_ids.clone(),
                });
                active_bind_group = None;
            }
            WgpuNativeRenderPipelineOperation::SetRenderPipeline { .. } => {
                active_bind_group = None;
            }
            _ => {}
        }
    }

    (draw_batches, skipped_draws)
}

fn drawable_bind_group(
    active_bind_group: Option<&WgpuNativeRenderResourceBindGroup>,
) -> Option<WgpuNativeRenderResourceBindGroup> {
    active_bind_group
        .filter(|group| group.layout != WgpuNativeRenderBindGroupLayout::None)
        .cloned()
}
