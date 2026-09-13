use super::*;

pub(super) fn upload(
    role: WgpuNativeRenderBufferRole,
    staging_byte_offset: usize,
    byte_len: usize,
    bytes: Vec<u8>,
) -> WgpuNativeRenderGpuBufferUpload {
    WgpuNativeRenderGpuBufferUpload {
        pass_index: 0,
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: format!("test::{role:?}"),
            role,
            byte_len,
            element_count: byte_len,
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
        staging_byte_offset,
        buffer_byte_offset: 0,
        byte_len,
        element_count: byte_len,
        bytes,
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

pub(super) fn pipeline_descriptor(
    key: WgpuNativeRenderPipelineKey,
) -> WgpuNativeRenderPipelineDescriptor {
    WgpuNativeRenderPipelineDescriptor {
        label: format!("test::{:?}", key.pipeline),
        key,
        vertex_layout: WgpuNativeRenderVertexLayout {
            array_stride: 16,
            step_mode: WgpuNativeRenderVertexStepMode::Vertex,
            attributes: vec![
                WgpuNativeRenderVertexAttribute {
                    shader_location: 0,
                    offset: 0,
                    format: WgpuNativeRenderVertexFormat::Float32x2,
                    semantic: WgpuNativeRenderVertexSemantic::Position,
                },
                WgpuNativeRenderVertexAttribute {
                    shader_location: 1,
                    offset: 8,
                    format: WgpuNativeRenderVertexFormat::Float32x2,
                    semantic: WgpuNativeRenderVertexSemantic::Uv,
                },
            ],
        },
        index_format: WgpuNativeRenderIndexFormat::Uint32,
        primitive_topology: WgpuNativeRenderPrimitiveTopology::TriangleList,
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
