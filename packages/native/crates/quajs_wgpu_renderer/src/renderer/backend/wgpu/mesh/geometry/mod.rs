mod clip;
mod fit;
mod types;
mod uv;
mod vertices;

use super::super::physical::WgpuPhysicalRect;
use super::super::primitive::WgpuNativeRenderPrimitive;
use super::vertex::WgpuNativeRenderVertex;

use clip::media_scissor;
use fit::media_vertex_rect;
use uv::texture_uv_rect;
use vertices::{
    apply_uv_flip_horizontal, character_flip_horizontal, quad_vertices, rotation_degrees,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WgpuPrimitiveGeometry {
    pub vertices: [WgpuNativeRenderVertex; 4],
    pub scissor: Option<WgpuPhysicalRect>,
}

pub(super) fn primitive_geometry(
    primitive: &WgpuNativeRenderPrimitive,
    texture_size: Option<(u32, u32)>,
) -> WgpuPrimitiveGeometry {
    let vertex_rect = media_vertex_rect(primitive, texture_size);
    let mut vertices = quad_vertices(
        vertex_rect,
        texture_uv_rect(primitive),
        rotation_degrees(primitive),
    );
    if character_flip_horizontal(primitive) {
        apply_uv_flip_horizontal(&mut vertices);
    }
    WgpuPrimitiveGeometry {
        vertices,
        scissor: media_scissor(primitive, vertex_rect),
    }
}
