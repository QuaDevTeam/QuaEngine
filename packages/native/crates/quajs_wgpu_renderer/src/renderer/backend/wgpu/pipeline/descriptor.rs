use crate::render_graph::DrawBatchPipeline;
use crate::resources::ResourceId;

use super::super::buffer::WgpuNativeRenderBufferVertex;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderBufferDescriptor {
    pub label: String,
    pub role: WgpuNativeRenderBufferRole,
    pub byte_len: usize,
    pub element_count: usize,
    pub usage: WgpuNativeRenderBufferUsage,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderBufferRole {
    Vertex,
    Index,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderBufferUsage {
    VertexCopyDst,
    IndexCopyDst,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct WgpuNativeRenderPipelineKey {
    pub pipeline: DrawBatchPipeline,
    pub shader: WgpuNativeRenderShader,
    pub bind_group_layout: WgpuNativeRenderBindGroupLayout,
    pub blend: WgpuNativeRenderBlendMode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum WgpuNativeRenderShader {
    Clear,
    SolidColor,
    TexturedQuad,
    TextPlaceholder,
    ClipMask,
    CustomFallback,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum WgpuNativeRenderBindGroupLayout {
    None,
    TextureSampler,
    TextAtlas,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum WgpuNativeRenderBlendMode {
    Replace,
    Alpha,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderPipelineDescriptor {
    pub key: WgpuNativeRenderPipelineKey,
    pub label: String,
    pub vertex_layout: WgpuNativeRenderVertexLayout,
    pub index_format: WgpuNativeRenderIndexFormat,
    pub primitive_topology: WgpuNativeRenderPrimitiveTopology,
}

impl WgpuNativeRenderPipelineDescriptor {
    pub(super) fn from_key(key: WgpuNativeRenderPipelineKey) -> Self {
        Self {
            label: format!(
                "qua-native::{:?}::{:?}::{:?}",
                key.pipeline, key.shader, key.bind_group_layout
            ),
            key,
            vertex_layout: WgpuNativeRenderVertexLayout::quad(),
            index_format: WgpuNativeRenderIndexFormat::Uint32,
            primitive_topology: WgpuNativeRenderPrimitiveTopology::TriangleList,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderVertexLayout {
    pub array_stride: usize,
    pub step_mode: WgpuNativeRenderVertexStepMode,
    pub attributes: Vec<WgpuNativeRenderVertexAttribute>,
}

impl WgpuNativeRenderVertexLayout {
    fn quad() -> Self {
        Self {
            array_stride: std::mem::size_of::<WgpuNativeRenderBufferVertex>(),
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
                    offset: std::mem::size_of::<[f32; 2]>(),
                    format: WgpuNativeRenderVertexFormat::Float32x2,
                    semantic: WgpuNativeRenderVertexSemantic::Uv,
                },
                WgpuNativeRenderVertexAttribute {
                    shader_location: 2,
                    offset: std::mem::size_of::<[f32; 4]>(),
                    format: WgpuNativeRenderVertexFormat::Float32x4,
                    semantic: WgpuNativeRenderVertexSemantic::Color,
                },
            ],
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderVertexStepMode {
    Vertex,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderVertexAttribute {
    pub shader_location: u32,
    pub offset: usize,
    pub format: WgpuNativeRenderVertexFormat,
    pub semantic: WgpuNativeRenderVertexSemantic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderVertexFormat {
    Float32x2,
    Float32x4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderVertexSemantic {
    Position,
    Uv,
    Color,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderIndexFormat {
    Uint32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderPrimitiveTopology {
    TriangleList,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderResourceBindGroup {
    pub command_id: String,
    pub layout: WgpuNativeRenderBindGroupLayout,
    pub resource_ids: Vec<ResourceId>,
}
