use crate::render_graph::DrawCommandKind;

use super::super::super::mesh::{WgpuNativeRenderPaint, WgpuNativeRenderQuad};
use super::super::border::{
    border_segment_rects, physical_rect_from_float, vertices_from_float_rect,
};
use super::super::color::color_to_rgba;
use super::super::geometry::rounded_border_geometry;
use super::super::types::{WgpuNativeRenderBufferVertex, WgpuNativeRenderDrawCall};
use super::{append_geometry_buffers, append_quad_buffers};

pub(in crate::renderer::backend::wgpu::buffer) fn append_border_buffers(
    quad: &WgpuNativeRenderQuad,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    draw_calls: &mut Vec<WgpuNativeRenderDrawCall>,
) {
    let Some(border) = &quad.border else {
        return;
    };
    let Some(color) = border.color else {
        return;
    };
    if border.width <= 0.0 {
        return;
    }

    let literal = border
        .literal
        .clone()
        .unwrap_or_else(|| "currentColor".to_string());

    if let Some(geometry) = rounded_border_geometry(
        quad.physical_bounds,
        quad.corner_radius,
        border.width,
        color_to_rgba(color),
        quad.opacity,
    ) {
        let first_vertex = vertices.len() as u32;
        let first_index = indices.len() as u32;
        let border_quad = WgpuNativeRenderQuad {
            command_id: format!("{}:border", quad.command_id),
            pipeline: quad.pipeline,
            draw_kind: DrawCommandKind::RoundedRect,
            physical_bounds: quad.physical_bounds,
            scissor: quad.scissor,
            vertices: quad.vertices,
            indices: quad.indices,
            paint: WgpuNativeRenderPaint::Solid { color, literal },
            opacity: quad.opacity,
            corner_radius: quad.corner_radius,
            border: None,
            text_overlay: None,
            owner_package_id: quad.owner_package_id.clone(),
            required_package_ids: quad.required_package_ids.clone(),
            resource_ids: Vec::new(),
        };
        append_geometry_buffers(geometry, first_vertex, vertices, indices);
        draw_calls.push(WgpuNativeRenderDrawCall::from_quad_range(
            &border_quad,
            first_vertex,
            first_index,
            (vertices.len() as u32).saturating_sub(first_vertex),
            (indices.len() as u32).saturating_sub(first_index),
        ));
        return;
    }

    for (name, rect) in border_segment_rects(quad.physical_bounds, border.width as f32) {
        if rect.width <= 0.0 || rect.height <= 0.0 {
            continue;
        }

        let segment = WgpuNativeRenderQuad {
            command_id: format!("{}:border:{name}", quad.command_id),
            pipeline: quad.pipeline,
            draw_kind: DrawCommandKind::Rect,
            physical_bounds: physical_rect_from_float(rect),
            scissor: quad.scissor,
            vertices: vertices_from_float_rect(rect),
            indices: [0, 1, 2, 0, 2, 3],
            paint: WgpuNativeRenderPaint::Solid {
                color,
                literal: literal.clone(),
            },
            opacity: quad.opacity,
            corner_radius: 0.0,
            border: None,
            text_overlay: None,
            owner_package_id: quad.owner_package_id.clone(),
            required_package_ids: quad.required_package_ids.clone(),
            resource_ids: Vec::new(),
        };
        append_quad_buffers(&segment, vertices, indices, draw_calls);
    }
}
