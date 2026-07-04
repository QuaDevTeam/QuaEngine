use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, LogicalRect, RenderPlane, RenderViewport,
};
use crate::resources::ResourceId;

use super::super::{
    NativeBackendCommandStreamCommand, NativeBackendCommandStreamPass,
    NativeBackendCommandStreamPlan, NativeBackendCommandStreamValidationReport,
    NativeBackendEncoderSkipReason,
};
use super::physical::{
    physical_draw_rect, physical_scissor_rect, physical_viewport_rect, WgpuPhysicalRect,
};

mod metadata;
mod resource;

pub use metadata::WgpuNativeRenderDrawMetadata;
pub use resource::WgpuNativeRenderOperationBoundResource;

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderExecutionPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub operation_count: usize,
    pub draw_operation_count: usize,
    pub skipped_draw_operation_count: usize,
    pub resource_bind_operation_count: usize,
    pub validation: NativeBackendCommandStreamValidationReport,
    pub passes: Vec<WgpuNativeRenderExecutionPass>,
}

impl WgpuNativeRenderExecutionPlan {
    pub fn from_command_stream_plan(command_stream: &NativeBackendCommandStreamPlan) -> Self {
        let passes = command_stream
            .passes
            .iter()
            .map(WgpuNativeRenderExecutionPass::from_command_stream_pass)
            .collect::<Vec<_>>();
        let operation_count = passes.iter().map(|pass| pass.operation_count).sum();
        let draw_operation_count = passes.iter().map(|pass| pass.draw_operation_count).sum();
        let skipped_draw_operation_count = passes
            .iter()
            .map(|pass| pass.skipped_draw_operation_count)
            .sum();
        let resource_bind_operation_count = passes
            .iter()
            .map(|pass| pass.resource_bind_operation_count)
            .sum();

        Self {
            revision: command_stream.revision,
            pass_count: command_stream.pass_count,
            operation_count,
            draw_operation_count,
            skipped_draw_operation_count,
            resource_bind_operation_count,
            validation: command_stream.validate(),
            passes,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderExecutionPass {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: RenderViewport,
    pub physical_viewport: WgpuPhysicalRect,
    pub operation_count: usize,
    pub draw_operation_count: usize,
    pub skipped_draw_operation_count: usize,
    pub resource_bind_operation_count: usize,
    pub operations: Vec<WgpuNativeRenderExecutionOperation>,
}

impl WgpuNativeRenderExecutionPass {
    fn from_command_stream_pass(pass: &NativeBackendCommandStreamPass) -> Self {
        let operations = pass
            .commands
            .iter()
            .map(|command| {
                WgpuNativeRenderExecutionOperation::from_command_stream_command(
                    command,
                    &pass.viewport,
                )
            })
            .collect::<Vec<_>>();
        let draw_operation_count = operations
            .iter()
            .filter(|operation| {
                matches!(operation, WgpuNativeRenderExecutionOperation::Draw { .. })
            })
            .count();
        let skipped_draw_operation_count = operations
            .iter()
            .filter(|operation| {
                matches!(
                    operation,
                    WgpuNativeRenderExecutionOperation::SkipDraw { .. }
                )
            })
            .count();
        let resource_bind_operation_count = operations
            .iter()
            .filter(|operation| {
                matches!(
                    operation,
                    WgpuNativeRenderExecutionOperation::BindResources { .. }
                )
            })
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            physical_viewport: physical_viewport_rect(&pass.viewport),
            operation_count: operations.len(),
            draw_operation_count,
            skipped_draw_operation_count,
            resource_bind_operation_count,
            operations,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderExecutionOperation {
    SetPipeline {
        pipeline: DrawBatchPipeline,
    },
    SetScissor {
        rect: LogicalRect,
        physical_rect: WgpuPhysicalRect,
        depth: usize,
    },
    ClearScissor {
        depth: usize,
    },
    BindResources {
        command_id: String,
        pipeline: DrawBatchPipeline,
        resources: Vec<WgpuNativeRenderOperationBoundResource>,
    },
    Draw {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: WgpuNativeRenderDrawMetadata,
        physical_bounds: WgpuPhysicalRect,
        clip_depth: usize,
        resource_count: usize,
    },
    SkipDraw {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: WgpuNativeRenderDrawMetadata,
        physical_bounds: WgpuPhysicalRect,
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
    },
}

impl WgpuNativeRenderExecutionOperation {
    fn from_command_stream_command(
        command: &NativeBackendCommandStreamCommand,
        viewport: &RenderViewport,
    ) -> Self {
        match command {
            NativeBackendCommandStreamCommand::SetPipeline { pipeline } => Self::SetPipeline {
                pipeline: *pipeline,
            },
            NativeBackendCommandStreamCommand::SetClip { rect, depth } => Self::SetScissor {
                rect: *rect,
                physical_rect: physical_scissor_rect(viewport, *rect),
                depth: *depth,
            },
            NativeBackendCommandStreamCommand::ClearClip { depth } => {
                Self::ClearScissor { depth: *depth }
            }
            NativeBackendCommandStreamCommand::BindResources {
                command_id,
                pipeline,
                resources,
            } => Self::BindResources {
                command_id: command_id.clone(),
                pipeline: *pipeline,
                resources: resources
                    .iter()
                    .map(WgpuNativeRenderOperationBoundResource::from_command_stream_resource)
                    .collect(),
            },
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                pipeline,
                kind,
                metadata,
                clip_depth,
                resource_count,
            } => Self::Draw {
                command_id: command_id.clone(),
                pipeline: *pipeline,
                kind: *kind,
                metadata: WgpuNativeRenderDrawMetadata::from_command_metadata(metadata),
                physical_bounds: physical_draw_rect(viewport, metadata.bounds),
                clip_depth: *clip_depth,
                resource_count: *resource_count,
            },
            NativeBackendCommandStreamCommand::SkipDraw {
                command_id,
                pipeline,
                kind,
                metadata,
                reason,
                missing_resource_ids,
            } => Self::SkipDraw {
                command_id: command_id.clone(),
                pipeline: *pipeline,
                kind: *kind,
                metadata: WgpuNativeRenderDrawMetadata::from_command_metadata(metadata),
                physical_bounds: physical_draw_rect(viewport, metadata.bounds),
                reason: *reason,
                missing_resource_ids: missing_resource_ids.clone(),
            },
        }
    }
}

#[cfg(test)]
mod tests;
