use super::*;

use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    InMemoryWgpuNativeRenderRuntimeExecutor, WgpuNativeRenderBindGroupLayout,
    WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole,
    WgpuNativeRenderBufferUsage, WgpuNativeRenderBufferVertex, WgpuNativeRenderIndexFormat,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutor, WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
    WgpuNativeRenderShader, WgpuNativeRenderVertexLayout, WgpuNativeRenderVertexStepMode,
    WgpuPhysicalRect,
};

const QUAD_VERTEX_BYTE_LEN: usize = WgpuNativeRenderBufferVertex::QUAD_BYTE_LEN;

mod color_fallback;
mod invalid_text_atlas;
mod support;
mod text_atlas;
