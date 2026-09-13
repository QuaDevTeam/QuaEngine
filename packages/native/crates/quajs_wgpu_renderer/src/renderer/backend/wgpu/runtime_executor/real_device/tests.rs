use super::texture::placeholder_texture_rgba8;
use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    InMemoryWgpuNativeRenderRuntimeExecutor, WgpuNativeRenderBindGroupLayout,
    WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole,
    WgpuNativeRenderBufferUsage, WgpuNativeRenderBufferVertex, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
    WgpuNativeRenderRuntimeTexturePackageMemory, WgpuNativeRenderShader, WgpuPhysicalRect,
};

const QUAD_VERTEX_BYTE_LEN: usize = WgpuNativeRenderBufferVertex::QUAD_BYTE_LEN;

mod bind_group_pipeline;
mod bind_group_validation;
mod buffer_roles;
mod draw_ranges;
mod draw_state;
mod pass_validation;
mod pipeline_cache;
mod presentation;
mod release_guards;
mod smoke;
mod texture;
mod viewport_state;
mod viewport_validation;

fn bytes_for_len(byte_len: usize) -> Vec<u8> {
    (0..byte_len).map(|index| (index % 251) as u8).collect()
}

fn pipeline_descriptor(
    label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> crate::renderer::backend::wgpu::WgpuNativeRenderPipelineDescriptor {
    crate::renderer::backend::wgpu::WgpuNativeRenderPipelineDescriptor {
        label: label.to_string(),
        key,
        vertex_layout: crate::renderer::backend::wgpu::WgpuNativeRenderVertexLayout {
            array_stride: WgpuNativeRenderBufferVertex::BYTE_LEN,
            step_mode: crate::renderer::backend::wgpu::WgpuNativeRenderVertexStepMode::Vertex,
            attributes: vec![],
        },
        index_format: crate::renderer::backend::wgpu::WgpuNativeRenderIndexFormat::Uint32,
        primitive_topology:
            crate::renderer::backend::wgpu::WgpuNativeRenderPrimitiveTopology::TriangleList,
    }
}

fn quad_vertex_bytes() -> Vec<u8> {
    [
        [8.0_f32, 8.0, 0.0, 0.0],
        [56.0, 8.0, 1.0, 0.0],
        [56.0, 56.0, 1.0, 1.0],
        [8.0, 56.0, 0.0, 1.0],
    ]
    .into_iter()
    .flat_map(|position_uv| {
        position_uv
            .into_iter()
            .chain([0.2, 0.4, 0.8, 1.0])
            // Three effect vectors are part of the real 80-byte vertex format.
            .chain([0.0; 12])
    })
    .flat_map(f32::to_le_bytes)
    .collect()
}

fn quad_index_bytes() -> Vec<u8> {
    [0_u32, 1, 2, 0, 2, 3]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect()
}
