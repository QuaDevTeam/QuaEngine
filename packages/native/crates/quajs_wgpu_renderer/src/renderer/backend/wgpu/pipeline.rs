mod builder;
mod descriptor;

use std::collections::BTreeSet;

use crate::render_graph::RenderPlane;
use crate::resources::ResourceId;

use super::physical::WgpuPhysicalRect;
use super::render_pass::WgpuNativeRenderPassPlan;
use builder::PipelinePassBuilder;

pub use descriptor::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderIndexFormat,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderResourceBindGroup, WgpuNativeRenderShader,
    WgpuNativeRenderVertexAttribute, WgpuNativeRenderVertexFormat, WgpuNativeRenderVertexLayout,
    WgpuNativeRenderVertexSemantic, WgpuNativeRenderVertexStepMode,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPipelinePlan {
    pub revision: u64,
    pub pass_count: usize,
    pub operation_count: usize,
    pub buffer_upload_count: usize,
    pub pipeline_descriptor_count: usize,
    pub pipeline_bind_count: usize,
    pub resource_bind_group_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_operation_count: usize,
    pub pipeline_descriptors: Vec<WgpuNativeRenderPipelineDescriptor>,
    pub passes: Vec<WgpuNativeRenderPipelinePass>,
}

impl WgpuNativeRenderPipelinePlan {
    pub fn from_render_pass_plan(render_pass_plan: &WgpuNativeRenderPassPlan) -> Self {
        let passes = render_pass_plan
            .passes
            .iter()
            .map(WgpuNativeRenderPipelinePass::from_render_pass)
            .collect::<Vec<_>>();
        let pipeline_descriptors = pipeline_descriptors(&passes);

        Self {
            revision: render_pass_plan.revision,
            pass_count: render_pass_plan.pass_count,
            operation_count: passes.iter().map(|pass| pass.operation_count).sum(),
            buffer_upload_count: passes.iter().map(|pass| pass.buffer_upload_count).sum(),
            pipeline_descriptor_count: pipeline_descriptors.len(),
            pipeline_bind_count: passes.iter().map(|pass| pass.pipeline_bind_count).sum(),
            resource_bind_group_count: passes
                .iter()
                .map(|pass| pass.resource_bind_group_count)
                .sum(),
            draw_indexed_count: passes.iter().map(|pass| pass.draw_indexed_count).sum(),
            skipped_operation_count: passes.iter().map(|pass| pass.skipped_operation_count).sum(),
            pipeline_descriptors,
            passes,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPipelinePass {
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub operation_count: usize,
    pub buffer_upload_count: usize,
    pub pipeline_bind_count: usize,
    pub resource_bind_group_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_operation_count: usize,
    pub operations: Vec<WgpuNativeRenderPipelineOperation>,
}

impl WgpuNativeRenderPipelinePass {
    fn from_render_pass(pass: &super::render_pass::WgpuNativeRenderPass) -> Self {
        let mut builder = PipelinePassBuilder::default();
        for operation in &pass.operations {
            builder.push_operation(operation);
        }
        let operations = builder.operations;

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            operation_count: operations.len(),
            buffer_upload_count: count_operations(&operations, OperationKind::BufferUpload),
            pipeline_bind_count: count_operations(&operations, OperationKind::PipelineBind),
            resource_bind_group_count: count_operations(&operations, OperationKind::ResourceBind),
            draw_indexed_count: count_operations(&operations, OperationKind::DrawIndexed),
            skipped_operation_count: count_operations(&operations, OperationKind::SkipDraw),
            operations,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderPipelineOperation {
    UploadBuffer {
        descriptor: WgpuNativeRenderBufferDescriptor,
    },
    BeginRenderPass {
        pass_index: usize,
        plane: Option<RenderPlane>,
        viewport: WgpuPhysicalRect,
    },
    SetViewport {
        viewport: WgpuPhysicalRect,
    },
    SetRenderPipeline {
        command_id: String,
        key: WgpuNativeRenderPipelineKey,
    },
    BindResourceGroup {
        group: WgpuNativeRenderResourceBindGroup,
    },
    DrawIndexed {
        command_id: String,
        key: WgpuNativeRenderPipelineKey,
        first_index: u32,
        index_count: u32,
        first_vertex: u32,
        vertex_count: u32,
        physical_bounds: WgpuPhysicalRect,
        scissor: Option<WgpuPhysicalRect>,
    },
    SkipDraw {
        command_id: String,
        reason: String,
        resource_ids: Vec<ResourceId>,
        owner_package_id: Option<String>,
        required_package_ids: Vec<String>,
    },
    EndRenderPass {
        pass_index: usize,
    },
}

#[derive(Clone, Copy)]
enum OperationKind {
    BufferUpload,
    PipelineBind,
    ResourceBind,
    DrawIndexed,
    SkipDraw,
}

fn pipeline_descriptors(
    passes: &[WgpuNativeRenderPipelinePass],
) -> Vec<WgpuNativeRenderPipelineDescriptor> {
    let mut descriptor_keys = BTreeSet::new();
    for pass in passes {
        for operation in &pass.operations {
            if let WgpuNativeRenderPipelineOperation::SetRenderPipeline { key, .. }
            | WgpuNativeRenderPipelineOperation::DrawIndexed { key, .. } = operation
            {
                descriptor_keys.insert(key.clone());
            }
        }
    }

    descriptor_keys
        .into_iter()
        .map(WgpuNativeRenderPipelineDescriptor::from_key)
        .collect()
}

fn count_operations(
    operations: &[WgpuNativeRenderPipelineOperation],
    kind: OperationKind,
) -> usize {
    operations
        .iter()
        .filter(|operation| match kind {
            OperationKind::BufferUpload => {
                matches!(
                    operation,
                    WgpuNativeRenderPipelineOperation::UploadBuffer { .. }
                )
            }
            OperationKind::PipelineBind => {
                matches!(
                    operation,
                    WgpuNativeRenderPipelineOperation::SetRenderPipeline { .. }
                )
            }
            OperationKind::ResourceBind => {
                matches!(
                    operation,
                    WgpuNativeRenderPipelineOperation::BindResourceGroup { .. }
                )
            }
            OperationKind::DrawIndexed => {
                matches!(
                    operation,
                    WgpuNativeRenderPipelineOperation::DrawIndexed { .. }
                )
            }
            OperationKind::SkipDraw => {
                matches!(
                    operation,
                    WgpuNativeRenderPipelineOperation::SkipDraw { .. }
                )
            }
        })
        .count()
}

#[cfg(test)]
mod tests;
