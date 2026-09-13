use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};
use crate::resources::ResourceId;

use super::super::mesh::WgpuNativeRenderPaint;
use super::super::physical::WgpuPhysicalRect;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderBufferVertex {
    pub position: [f32; 2],
    pub uv: [f32; 2],
    pub color: [f32; 4],
    pub effect0: [f32; 4],
    pub effect1: [f32; 4],
    pub effect2: [f32; 4],
}

impl WgpuNativeRenderBufferVertex {
    pub const BYTE_LEN: usize = std::mem::size_of::<Self>();
    pub const QUAD_BYTE_LEN: usize = 4 * Self::BYTE_LEN;
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderDrawCall {
    pub command_id: String,
    pub pipeline: DrawBatchPipeline,
    pub draw_kind: DrawCommandKind,
    pub first_vertex: u32,
    pub vertex_count: u32,
    pub first_index: u32,
    pub index_count: u32,
    pub physical_bounds: WgpuPhysicalRect,
    pub scissor: Option<WgpuPhysicalRect>,
    pub paint: WgpuNativeRenderPaint,
    pub opacity: f32,
    pub corner_radius: f32,
    pub resource_ids: Vec<ResourceId>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderSkippedQuad {
    pub command_id: String,
    pub reason: WgpuNativeRenderSkippedQuadReason,
    pub physical_bounds: WgpuPhysicalRect,
    pub resource_ids: Vec<ResourceId>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderSkippedQuadReason {
    EmptyBounds,
    Transparent,
    MissingResources,
    NonDrawablePaint,
    InvalidPaint,
}

impl WgpuNativeRenderSkippedQuadReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EmptyBounds => "empty-bounds",
            Self::Transparent => "transparent",
            Self::MissingResources => "missing-resources",
            Self::NonDrawablePaint => "non-drawable-paint",
            Self::InvalidPaint => "invalid-paint",
        }
    }
}

impl std::fmt::Display for WgpuNativeRenderSkippedQuadReason {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}
