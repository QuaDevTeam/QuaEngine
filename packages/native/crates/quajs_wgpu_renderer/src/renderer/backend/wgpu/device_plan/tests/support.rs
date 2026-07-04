use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderGpuBufferAllocation,
    WgpuNativeRenderIndexFormat, WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderQueueWrite, WgpuNativeRenderShader,
    WgpuNativeRenderVertexAttribute, WgpuNativeRenderVertexFormat, WgpuNativeRenderVertexLayout,
    WgpuNativeRenderVertexSemantic, WgpuNativeRenderVertexStepMode, WgpuPhysicalRect,
};

pub(super) fn gpu_buffer(
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> WgpuNativeRenderGpuBufferAllocation {
    WgpuNativeRenderGpuBufferAllocation {
        label: label.to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: label.to_string(),
            role,
            byte_len,
            element_count: byte_len,
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
        byte_len,
    }
}

pub(super) fn queue_write(
    target_label: &str,
    staging_byte_offset: usize,
    byte_len: usize,
    _checksum: u64,
) -> WgpuNativeRenderQueueWrite {
    let bytes = bytes_for_len(byte_len);
    WgpuNativeRenderQueueWrite {
        target_label: target_label.to_string(),
        staging_byte_offset,
        buffer_byte_offset: 0,
        byte_len,
        checksum: checksum(&bytes),
        bytes,
    }
}

fn bytes_for_len(byte_len: usize) -> Vec<u8> {
    (0..byte_len).map(|index| (index % 251) as u8).collect()
}

pub(super) fn checksum(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}

pub(super) fn pipeline_key() -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

pub(super) fn pipeline_descriptor(
    key: WgpuNativeRenderPipelineKey,
) -> WgpuNativeRenderPipelineDescriptor {
    WgpuNativeRenderPipelineDescriptor {
        label: "ui pipeline".to_string(),
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
