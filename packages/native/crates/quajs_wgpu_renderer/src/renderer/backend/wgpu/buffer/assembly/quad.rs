use super::super::super::mesh::{
    WgpuNativeRenderColor, WgpuNativeRenderPaint, WgpuNativeRenderQuad,
};
use super::super::color::{color_struct_to_rgba, color_to_rgba};
use super::super::geometry::{
    rounded_rect_geometry, rounded_rect_geometry_with_uv_bounds, WgpuNativeRenderBufferGeometry,
};
use super::super::text_geometry::text_placeholder_geometry;
use super::super::types::{WgpuNativeRenderBufferVertex, WgpuNativeRenderDrawCall};
use super::append_geometry_buffers;
use crate::fonts::FontBackendAtlasLayoutMap;

pub(in crate::renderer::backend::wgpu::buffer) fn append_quad_buffers(
    quad: &WgpuNativeRenderQuad,
    font_atlases: &FontBackendAtlasLayoutMap,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    draw_calls: &mut Vec<WgpuNativeRenderDrawCall>,
) {
    let first_vertex = vertices.len() as u32;
    let first_index = indices.len() as u32;
    if let WgpuNativeRenderPaint::TextPlaceholder {
        text, color, style, ..
    } = &quad.paint
    {
        if let Some((geometry, atlas_resource_id)) = text_placeholder_geometry(
            quad.physical_bounds,
            text,
            style,
            color_to_rgba(*color),
            quad.opacity,
            font_atlases,
        ) {
            let physical_bounds = geometry.physical_bounds;
            let placeholder_quad = WgpuNativeRenderQuad {
                command_id: quad.command_id.clone(),
                pipeline: quad.pipeline,
                draw_kind: quad.draw_kind,
                physical_bounds,
                scissor: quad.scissor,
                vertices: quad.vertices,
                indices: quad.indices,
                paint: quad.paint.clone(),
                opacity: quad.opacity,
                corner_radius: 0.0,
                border: None,
                text_overlay: None,
                owner_package_id: quad.owner_package_id.clone(),
                required_package_ids: quad.required_package_ids.clone(),
                resource_ids: atlas_resource_id.into_iter().collect(),
            };
            append_geometry_buffers(geometry, vertices, indices);
            draw_calls.push(WgpuNativeRenderDrawCall::from_quad_range(
                &placeholder_quad,
                first_vertex,
                first_index,
                (vertices.len() as u32).saturating_sub(first_vertex),
                (indices.len() as u32).saturating_sub(first_index),
            ));
        }
        return;
    }

    let vertex_color = vertex_color_from_quad(quad);
    if should_tessellate_rounded_quad(quad) {
        if let Some(geometry) = rounded_quad_geometry(quad, vertex_color) {
            append_geometry_buffers(geometry, vertices, indices);
            draw_calls.push(WgpuNativeRenderDrawCall::from_quad_range(
                quad,
                first_vertex,
                first_index,
                (vertices.len() as u32).saturating_sub(first_vertex),
                (indices.len() as u32).saturating_sub(first_index),
            ));
            return;
        }
    }

    vertices.extend(
        quad.vertices
            .iter()
            .map(|vertex| WgpuNativeRenderBufferVertex::from_mesh_vertex(vertex, vertex_color)),
    );
    indices.extend(quad.indices.iter().map(|index| *index as u32));
    draw_calls.push(WgpuNativeRenderDrawCall::from_quad(
        quad,
        first_vertex,
        first_index,
    ));
}

fn should_tessellate_rounded_quad(quad: &WgpuNativeRenderQuad) -> bool {
    quad.corner_radius > 0.0
        && matches!(
            quad.paint,
            WgpuNativeRenderPaint::Solid { .. } | WgpuNativeRenderPaint::Texture { .. }
        )
}

fn rounded_quad_geometry(
    quad: &WgpuNativeRenderQuad,
    vertex_color: [f32; 4],
) -> Option<WgpuNativeRenderBufferGeometry> {
    if matches!(quad.paint, WgpuNativeRenderPaint::Texture { .. }) {
        let (uv_top_left, uv_bottom_right) = rounded_texture_uv_bounds(quad);
        return rounded_rect_geometry_with_uv_bounds(
            quad.physical_bounds,
            quad.corner_radius,
            vertex_color,
            uv_top_left,
            uv_bottom_right,
        );
    }

    rounded_rect_geometry(quad.physical_bounds, quad.corner_radius, vertex_color)
}

fn rounded_texture_uv_bounds(quad: &WgpuNativeRenderQuad) -> ([f32; 2], [f32; 2]) {
    let vertices = &quad.vertices;
    let left = (vertices[0].uv[0] + vertices[3].uv[0]) * 0.5;
    let right = (vertices[1].uv[0] + vertices[2].uv[0]) * 0.5;
    let top = (vertices[0].uv[1] + vertices[1].uv[1]) * 0.5;
    let bottom = (vertices[2].uv[1] + vertices[3].uv[1]) * 0.5;

    ([left, top], [right, bottom])
}

fn vertex_color_from_quad(quad: &WgpuNativeRenderQuad) -> [f32; 4] {
    let color = match &quad.paint {
        WgpuNativeRenderPaint::Solid { color, .. }
        | WgpuNativeRenderPaint::TextPlaceholder { color, .. } => color_to_rgba(*color),
        WgpuNativeRenderPaint::Texture { tint, .. } => color_struct_to_rgba(*tint),
        WgpuNativeRenderPaint::Skipped { .. }
        | WgpuNativeRenderPaint::InvalidColor { .. }
        | WgpuNativeRenderPaint::None => color_struct_to_rgba(WgpuNativeRenderColor::WHITE),
    };
    [
        color[0],
        color[1],
        color[2],
        color[3] * quad.opacity.clamp(0.0, 1.0),
    ]
}
