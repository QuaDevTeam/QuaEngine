use super::texture::placeholder_texture_rgba8;
use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    InMemoryWgpuNativeRenderRuntimeExecutor, WgpuNativeRenderBindGroupLayout,
    WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole,
    WgpuNativeRenderBufferUsage, WgpuNativeRenderPipelineKey, WgpuNativeRenderRuntimeDevice,
    WgpuNativeRenderRuntimeErrorKind, WgpuNativeRenderRuntimeExecutionReport,
    WgpuNativeRenderRuntimeExecutor, WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
    WgpuNativeRenderRuntimeTexturePackageMemory, WgpuNativeRenderShader, WgpuPhysicalRect,
};

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
            array_stride: 32,
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
        8.0_f32, 8.0_f32, 0.0_f32, 0.0_f32, 0.2_f32, 0.4_f32, 0.8_f32, 1.0_f32, 56.0_f32, 8.0_f32,
        1.0_f32, 0.0_f32, 0.2_f32, 0.4_f32, 0.8_f32, 1.0_f32, 56.0_f32, 56.0_f32, 1.0_f32, 1.0_f32,
        0.2_f32, 0.4_f32, 0.8_f32, 1.0_f32, 8.0_f32, 56.0_f32, 0.0_f32, 1.0_f32, 0.2_f32, 0.4_f32,
        0.8_f32, 1.0_f32,
    ]
    .into_iter()
    .flat_map(f32::to_le_bytes)
    .collect()
}

fn quad_index_bytes() -> Vec<u8> {
    [0_u32, 1, 2, 0, 2, 3]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect()
}
