mod border;
mod draw;
mod quad;
mod text;

use super::super::mesh::WgpuNativeRenderVertex;
use super::types::WgpuNativeRenderBufferVertex;

pub(super) use border::append_border_buffers;
pub(super) use quad::append_quad_buffers;
pub(super) use text::append_text_overlay_buffers;

impl WgpuNativeRenderBufferVertex {
    pub(super) fn from_mesh_vertex(vertex: &WgpuNativeRenderVertex, color: [f32; 4]) -> Self {
        Self {
            position: vertex.position,
            uv: vertex.uv,
            color,
        }
    }
}

fn append_geometry_buffers(
    geometry: super::geometry::WgpuNativeRenderBufferGeometry,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
) {
    vertices.extend(geometry.vertices);
    indices.extend(geometry.indices);
}
