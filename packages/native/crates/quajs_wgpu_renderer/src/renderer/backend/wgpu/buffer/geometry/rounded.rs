use super::{vertex, vertex_with_uv_bounds, FloatRect, WgpuNativeRenderBufferGeometry};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

const ROUNDED_CORNER_SEGMENTS: usize = 6;

pub(in crate::renderer::backend::wgpu::buffer) fn rounded_rect_geometry(
    bounds: WgpuPhysicalRect,
    radius: f32,
    color: [f32; 4],
) -> Option<WgpuNativeRenderBufferGeometry> {
    rounded_rect_geometry_with_uv_bounds(bounds, radius, color, [0.0, 0.0], [1.0, 1.0])
}

pub(in crate::renderer::backend::wgpu::buffer) fn rounded_rect_geometry_with_uv_bounds(
    bounds: WgpuPhysicalRect,
    radius: f32,
    color: [f32; 4],
    uv_top_left: [f32; 2],
    uv_bottom_right: [f32; 2],
) -> Option<WgpuNativeRenderBufferGeometry> {
    let rect = FloatRect::from_physical(bounds)?;
    let radius = clamp_radius(rect, radius);
    if radius <= 0.0 {
        return None;
    }

    let points = rounded_rect_points(rect, radius);
    if points.len() < 3 {
        return None;
    }

    let mut vertices = Vec::with_capacity(points.len() + 1);
    vertices.push(vertex_with_uv_bounds(
        [rect.x + rect.width * 0.5, rect.y + rect.height * 0.5],
        rect,
        color,
        uv_top_left,
        uv_bottom_right,
    ));
    vertices.extend(
        points
            .iter()
            .map(|point| vertex_with_uv_bounds(*point, rect, color, uv_top_left, uv_bottom_right)),
    );

    let mut indices = Vec::with_capacity(points.len() * 3);
    for index in 0..points.len() {
        let current = index as u32 + 1;
        let next = ((index + 1) % points.len()) as u32 + 1;
        indices.extend([0, current, next]);
    }

    Some(WgpuNativeRenderBufferGeometry {
        physical_bounds: bounds,
        vertices,
        indices,
    })
}

pub(in crate::renderer::backend::wgpu::buffer) fn rounded_border_geometry(
    bounds: WgpuPhysicalRect,
    radius: f32,
    width: f32,
    mut color: [f32; 4],
    opacity: f32,
) -> Option<WgpuNativeRenderBufferGeometry> {
    let outer = FloatRect::from_physical(bounds)?;
    let width = width
        .max(0.0)
        .min(outer.width * 0.5)
        .min(outer.height * 0.5);
    let radius = clamp_radius(outer, radius);
    if width <= 0.0 || radius <= width {
        return None;
    }

    let inner = outer.inset(width)?;
    let inner_radius = clamp_radius(inner, radius - width);
    if inner_radius <= 0.0 {
        return None;
    }

    color[3] *= opacity.clamp(0.0, 1.0);
    let outer_points = rounded_rect_points(outer, radius);
    let inner_points = rounded_rect_points(inner, inner_radius);
    if outer_points.len() != inner_points.len() || outer_points.len() < 3 {
        return None;
    }

    let mut vertices = Vec::with_capacity(outer_points.len() * 2);
    for (outer_point, inner_point) in outer_points.iter().zip(inner_points.iter()) {
        vertices.push(vertex(*outer_point, outer, color));
        vertices.push(vertex(*inner_point, outer, color));
    }

    let mut indices = Vec::with_capacity(outer_points.len() * 6);
    for index in 0..outer_points.len() {
        let next = (index + 1) % outer_points.len();
        let outer_current = (index * 2) as u32;
        let inner_current = outer_current + 1;
        let outer_next = (next * 2) as u32;
        let inner_next = outer_next + 1;
        indices.extend([
            outer_current,
            outer_next,
            inner_next,
            outer_current,
            inner_next,
            inner_current,
        ]);
    }

    Some(WgpuNativeRenderBufferGeometry {
        physical_bounds: bounds,
        vertices,
        indices,
    })
}

fn rounded_rect_points(rect: FloatRect, radius: f32) -> Vec<[f32; 2]> {
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    let arcs = [
        ([right - radius, rect.y + radius], -90.0, 0.0),
        ([right - radius, bottom - radius], 0.0, 90.0),
        ([rect.x + radius, bottom - radius], 90.0, 180.0),
        ([rect.x + radius, rect.y + radius], 180.0, 270.0),
    ];

    let mut points = Vec::with_capacity(ROUNDED_CORNER_SEGMENTS * 4 + 4);
    for (center, start, end) in arcs {
        push_arc_points(&mut points, center, radius, start, end);
    }
    points
}

fn push_arc_points(
    points: &mut Vec<[f32; 2]>,
    center: [f32; 2],
    radius: f32,
    start_degrees: f32,
    end_degrees: f32,
) {
    for step in 0..=ROUNDED_CORNER_SEGMENTS {
        let t = step as f32 / ROUNDED_CORNER_SEGMENTS as f32;
        let angle = (start_degrees + (end_degrees - start_degrees) * t).to_radians();
        points.push([
            center[0] + radius * angle.cos(),
            center[1] + radius * angle.sin(),
        ]);
    }
}

fn clamp_radius(rect: FloatRect, radius: f32) -> f32 {
    radius.max(0.0).min(rect.width * 0.5).min(rect.height * 0.5)
}
