mod border;
mod draw;
mod quad;
mod text;

use super::super::mesh::WgpuNativeRenderVertex;
use super::super::physical::WgpuPhysicalRect;
use super::geometry::WgpuNativeRenderBufferGeometry;
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
            effect0: [0.0; 4],
            effect1: [0.0; 4],
            effect2: [0.0; 4],
        }
    }

    pub(super) fn with_effects(
        mut self,
        effect0: [f32; 4],
        effect1: [f32; 4],
        effect2: [f32; 4],
    ) -> Self {
        self.effect0 = effect0;
        self.effect1 = effect1;
        self.effect2 = effect2;
        self
    }
}

fn append_geometry_buffers(
    geometry: WgpuNativeRenderBufferGeometry,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    effect0: [f32; 4],
    effect1: [f32; 4],
    effect2: [f32; 4],
) {
    vertices.extend(
        geometry
            .vertices
            .into_iter()
            .map(|vertex| vertex.with_effects(effect0, effect1, effect2)),
    );
    indices.extend(geometry.indices);
}

fn prepare_text_blur_geometry(
    mut geometry: WgpuNativeRenderBufferGeometry,
    blur_radius: f32,
) -> WgpuNativeRenderBufferGeometry {
    let blur_radius = blur_radius.max(0.0);
    if blur_radius <= 0.001 {
        return geometry;
    }

    let blur_extent = blur_radius * 1.5;
    // Atlas clipping can turn an italic glyph quad into a 3..8 vertex fan.
    // Follow each fan's indices instead of assuming every four vertices are a
    // glyph, which otherwise deforms the next glyph at a clipped edge.
    let mut polygons = std::collections::BTreeMap::<usize, usize>::new();
    for triangle in geometry.indices.chunks_exact(3) {
        let end = *triangle.iter().max().unwrap() as usize + 1;
        polygons
            .entry(triangle[0] as usize)
            .and_modify(|n| *n = (*n).max(end))
            .or_insert(end);
    }
    for (start, end) in polygons {
        let quad = &mut geometry.vertices[start..end];
        let uv_min = quad.iter().fold([f32::INFINITY; 2], |mut value, vertex| {
            value[0] = value[0].min(vertex.uv[0]);
            value[1] = value[1].min(vertex.uv[1]);
            value
        });
        let uv_max = quad
            .iter()
            .fold([f32::NEG_INFINITY; 2], |mut value, vertex| {
                value[0] = value[0].max(vertex.uv[0]);
                value[1] = value[1].max(vertex.uv[1]);
                value
            });
        let position_min = quad.iter().fold([f32::INFINITY; 2], |mut value, vertex| {
            value[0] = value[0].min(vertex.position[0]);
            value[1] = value[1].min(vertex.position[1]);
            value
        });
        let position_max = quad
            .iter()
            .fold([f32::NEG_INFINITY; 2], |mut value, vertex| {
                value[0] = value[0].max(vertex.position[0]);
                value[1] = value[1].max(vertex.position[1]);
                value
            });
        let position_span = [
            position_max[0] - position_min[0],
            position_max[1] - position_min[1],
        ];
        let uv_span = [uv_max[0] - uv_min[0], uv_max[1] - uv_min[1]];
        if position_span[0] <= 0.001
            || position_span[1] <= 0.001
            || uv_span[0] <= 0.000001
            || uv_span[1] <= 0.000001
        {
            continue;
        }

        let uv_expansion = [
            blur_extent * uv_span[0] / position_span[0],
            blur_extent * uv_span[1] / position_span[1],
        ];
        for vertex in quad.iter_mut() {
            let x_direction = 2.0 * (vertex.uv[0] - uv_min[0]) / uv_span[0] - 1.0;
            let y_direction = 2.0 * (vertex.uv[1] - uv_min[1]) / uv_span[1] - 1.0;
            vertex.position[0] += blur_extent * x_direction;
            vertex.position[1] += blur_extent * y_direction;
            vertex.uv[0] += uv_expansion[0] * x_direction;
            vertex.uv[1] += uv_expansion[1] * y_direction;
            vertex.effect0 = [1.0, blur_radius * 0.5, uv_min[0], uv_min[1]];
            vertex.effect1 = [uv_max[0], uv_max[1], 0.0, 0.0];
        }
    }

    geometry.physical_bounds = physical_bounds_for_vertices(&geometry.vertices);
    geometry
}

fn append_prepared_geometry_buffers(
    geometry: WgpuNativeRenderBufferGeometry,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
) {
    vertices.extend(geometry.vertices);
    indices.extend(geometry.indices);
}

fn physical_bounds_for_vertices(vertices: &[WgpuNativeRenderBufferVertex]) -> WgpuPhysicalRect {
    let min_x = vertices
        .iter()
        .map(|vertex| vertex.position[0])
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0);
    let min_y = vertices
        .iter()
        .map(|vertex| vertex.position[1])
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0);
    let max_x = vertices
        .iter()
        .map(|vertex| vertex.position[0])
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .max(min_x);
    let max_y = vertices
        .iter()
        .map(|vertex| vertex.position[1])
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .max(min_y);

    WgpuPhysicalRect {
        x: min_x as u32,
        y: min_y as u32,
        width: (max_x - min_x) as u32,
        height: (max_y - min_y) as u32,
    }
}
