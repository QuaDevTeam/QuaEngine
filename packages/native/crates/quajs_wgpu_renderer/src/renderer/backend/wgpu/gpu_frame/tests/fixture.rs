use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferPass, WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage,
    WgpuNativeRenderBufferVertex, WgpuNativeRenderPipelineKey, WgpuNativeRenderPipelineOperation,
    WgpuNativeRenderPipelinePass, WgpuNativeRenderShader, WgpuPhysicalRect,
};

pub(super) fn buffer_pass(
    pass_index: usize,
    vertices: Vec<WgpuNativeRenderBufferVertex>,
    indices: Vec<u32>,
) -> WgpuNativeRenderBufferPass {
    WgpuNativeRenderBufferPass {
        pass_index,
        plane: Some(RenderPlane::Overlay),
        viewport: rect(0, 0, 1280, 720),
        vertex_count: vertices.len(),
        index_count: indices.len(),
        draw_call_count: 0,
        vertices,
        indices,
        draw_calls: Vec::new(),
        skipped_quads: Vec::new(),
    }
}

pub(super) fn pipeline_pass(
    pass_index: usize,
    operations: Vec<WgpuNativeRenderPipelineOperation>,
) -> WgpuNativeRenderPipelinePass {
    WgpuNativeRenderPipelinePass {
        pass_index,
        plane: Some(RenderPlane::Overlay),
        viewport: rect(0, 0, 1280, 720),
        operation_count: operations.len(),
        buffer_upload_count: operation_count(&operations, is_upload_operation),
        pipeline_bind_count: operation_count(&operations, is_pipeline_bind_operation),
        resource_bind_group_count: operation_count(&operations, is_resource_bind_operation),
        draw_indexed_count: operation_count(&operations, is_draw_indexed_operation),
        skipped_operation_count: operation_count(&operations, is_skip_draw_operation),
        operations,
    }
}

pub(super) fn upload_descriptor(
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
    element_count: usize,
) -> WgpuNativeRenderPipelineOperation {
    WgpuNativeRenderPipelineOperation::UploadBuffer {
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: match role {
                WgpuNativeRenderBufferRole::Vertex => "qua-native::frame-vertex-buffer",
                WgpuNativeRenderBufferRole::Index => "qua-native::frame-index-buffer",
            }
            .to_string(),
            role,
            byte_len,
            element_count,
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
    }
}

pub(super) fn pipeline_key(
    pipeline: DrawBatchPipeline,
    shader: WgpuNativeRenderShader,
    bind_group_layout: WgpuNativeRenderBindGroupLayout,
) -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline,
        shader,
        bind_group_layout,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

pub(super) fn vertex(position: [f32; 2], uv: [f32; 2]) -> WgpuNativeRenderBufferVertex {
    WgpuNativeRenderBufferVertex {
        position,
        uv,
        color: [1.0, 1.0, 1.0, 1.0],
        effect0: [0.0; 4],
        effect1: [0.0; 4],
    }
}

pub(super) fn rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}

pub(super) fn floats_to_bytes(values: &[f32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

pub(super) fn indices_to_bytes(values: &[u32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn operation_count(
    operations: &[WgpuNativeRenderPipelineOperation],
    predicate: fn(&WgpuNativeRenderPipelineOperation) -> bool,
) -> usize {
    operations
        .iter()
        .filter(|operation| predicate(operation))
        .count()
}

fn is_upload_operation(operation: &WgpuNativeRenderPipelineOperation) -> bool {
    matches!(
        operation,
        WgpuNativeRenderPipelineOperation::UploadBuffer { .. }
    )
}

fn is_pipeline_bind_operation(operation: &WgpuNativeRenderPipelineOperation) -> bool {
    matches!(
        operation,
        WgpuNativeRenderPipelineOperation::SetRenderPipeline { .. }
    )
}

fn is_resource_bind_operation(operation: &WgpuNativeRenderPipelineOperation) -> bool {
    matches!(
        operation,
        WgpuNativeRenderPipelineOperation::BindResourceGroup { .. }
    )
}

fn is_draw_indexed_operation(operation: &WgpuNativeRenderPipelineOperation) -> bool {
    matches!(
        operation,
        WgpuNativeRenderPipelineOperation::DrawIndexed { .. }
    )
}

fn is_skip_draw_operation(operation: &WgpuNativeRenderPipelineOperation) -> bool {
    matches!(
        operation,
        WgpuNativeRenderPipelineOperation::SkipDraw { .. }
    )
}
