use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::resources::ResourceId;

use super::buffer::{
    WgpuNativeRenderBufferPass, WgpuNativeRenderBufferPlan, WgpuNativeRenderDrawCall,
};
use super::mesh::WgpuNativeRenderPaint;
use super::physical::WgpuPhysicalRect;

type BufferVertex = super::buffer::WgpuNativeRenderBufferVertex;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPassPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub operation_count: usize,
    pub upload_operation_count: usize,
    pub draw_indexed_operation_count: usize,
    pub skipped_operation_count: usize,
    pub passes: Vec<WgpuNativeRenderPass>,
}

impl WgpuNativeRenderPassPlan {
    pub fn from_buffer_plan(buffer_plan: &WgpuNativeRenderBufferPlan) -> Self {
        let passes = buffer_plan
            .passes
            .iter()
            .map(WgpuNativeRenderPass::from_buffer_pass)
            .collect::<Vec<_>>();
        let operation_count = passes.iter().map(|pass| pass.operation_count).sum();
        let upload_operation_count = passes.iter().map(|pass| pass.upload_operation_count).sum();
        let draw_indexed_operation_count = passes
            .iter()
            .map(|pass| pass.draw_indexed_operation_count)
            .sum();
        let skipped_operation_count = passes.iter().map(|pass| pass.skipped_operation_count).sum();

        Self {
            revision: buffer_plan.revision,
            pass_count: buffer_plan.pass_count,
            operation_count,
            upload_operation_count,
            draw_indexed_operation_count,
            skipped_operation_count,
            passes,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPass {
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub operation_count: usize,
    pub upload_operation_count: usize,
    pub draw_indexed_operation_count: usize,
    pub skipped_operation_count: usize,
    pub operations: Vec<WgpuNativeRenderPassOperation>,
}

impl WgpuNativeRenderPass {
    fn from_buffer_pass(pass: &WgpuNativeRenderBufferPass) -> Self {
        let mut operations = Vec::new();
        if pass.vertex_count > 0 {
            operations.push(WgpuNativeRenderPassOperation::UploadVertexBuffer {
                byte_len: pass
                    .vertex_count
                    .saturating_mul(std::mem::size_of::<BufferVertex>()),
                vertex_count: pass.vertex_count,
            });
        }
        if pass.index_count > 0 {
            operations.push(WgpuNativeRenderPassOperation::UploadIndexBuffer {
                byte_len: pass.index_count.saturating_mul(std::mem::size_of::<u32>()),
                index_count: pass.index_count,
            });
        }
        operations.push(WgpuNativeRenderPassOperation::BeginRenderPass {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
        });
        operations.push(WgpuNativeRenderPassOperation::SetViewport {
            viewport: pass.viewport,
        });

        for draw_call in &pass.draw_calls {
            operations.extend(draw_operations(draw_call));
        }
        for skipped_quad in &pass.skipped_quads {
            operations.push(WgpuNativeRenderPassOperation::SkipDraw {
                command_id: skipped_quad.command_id.clone(),
                reason: skipped_quad.reason.to_string(),
                resource_ids: skipped_quad.resource_ids.clone(),
                owner_package_id: skipped_quad.owner_package_id.clone(),
                required_package_ids: skipped_quad.required_package_ids.clone(),
            });
        }

        operations.push(WgpuNativeRenderPassOperation::EndRenderPass {
            pass_index: pass.pass_index,
        });

        let upload_operation_count = operations
            .iter()
            .filter(|operation| {
                matches!(
                    operation,
                    WgpuNativeRenderPassOperation::UploadVertexBuffer { .. }
                        | WgpuNativeRenderPassOperation::UploadIndexBuffer { .. }
                )
            })
            .count();
        let draw_indexed_operation_count = operations
            .iter()
            .filter(|operation| {
                matches!(operation, WgpuNativeRenderPassOperation::DrawIndexed { .. })
            })
            .count();
        let skipped_operation_count = operations
            .iter()
            .filter(|operation| matches!(operation, WgpuNativeRenderPassOperation::SkipDraw { .. }))
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            operation_count: operations.len(),
            upload_operation_count,
            draw_indexed_operation_count,
            skipped_operation_count,
            operations,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderPassOperation {
    UploadVertexBuffer {
        byte_len: usize,
        vertex_count: usize,
    },
    UploadIndexBuffer {
        byte_len: usize,
        index_count: usize,
    },
    BeginRenderPass {
        pass_index: usize,
        plane: Option<RenderPlane>,
        viewport: WgpuPhysicalRect,
    },
    SetViewport {
        viewport: WgpuPhysicalRect,
    },
    SetPipeline {
        pipeline: DrawBatchPipeline,
    },
    BindResources {
        command_id: String,
        resource_ids: Vec<ResourceId>,
    },
    SetPaint {
        command_id: String,
        paint: WgpuNativeRenderPaint,
    },
    DrawIndexed {
        command_id: String,
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

fn draw_operations(draw_call: &WgpuNativeRenderDrawCall) -> Vec<WgpuNativeRenderPassOperation> {
    let mut operations = vec![
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: draw_call.pipeline,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: draw_call.command_id.clone(),
            paint: draw_call.paint.clone(),
        },
    ];

    if !draw_call.resource_ids.is_empty() || paint_requires_resource_bind(&draw_call.paint) {
        operations.push(WgpuNativeRenderPassOperation::BindResources {
            command_id: draw_call.command_id.clone(),
            resource_ids: draw_call.resource_ids.clone(),
        });
    }

    operations.push(WgpuNativeRenderPassOperation::DrawIndexed {
        command_id: draw_call.command_id.clone(),
        first_index: draw_call.first_index,
        index_count: draw_call.index_count,
        first_vertex: draw_call.first_vertex,
        vertex_count: draw_call.vertex_count,
        physical_bounds: draw_call.physical_bounds,
        scissor: draw_call.scissor,
    });

    operations
}

fn paint_requires_resource_bind(paint: &WgpuNativeRenderPaint) -> bool {
    matches!(
        paint,
        WgpuNativeRenderPaint::TextPlaceholder { .. }
            | WgpuNativeRenderPaint::Texture {
                resource_id: Some(_),
                ..
            }
    )
}

#[cfg(test)]
mod tests;
