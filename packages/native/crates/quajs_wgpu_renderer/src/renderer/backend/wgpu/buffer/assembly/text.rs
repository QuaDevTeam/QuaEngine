use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};

use super::super::super::mesh::{
    WgpuNativeRenderPaint, WgpuNativeRenderQuad, WgpuNativeRenderTextOverlay,
};
use super::super::color::color_to_rgba;
use super::super::geometry::WgpuNativeRenderBufferGeometry;
use super::super::text_geometry::text_placeholder_geometry;
use super::super::types::{WgpuNativeRenderBufferVertex, WgpuNativeRenderDrawCall};
use super::append_geometry_buffers;

pub(in crate::renderer::backend::wgpu::buffer) fn append_text_overlay_buffers(
    quad: &WgpuNativeRenderQuad,
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    draw_calls: &mut Vec<WgpuNativeRenderDrawCall>,
) {
    let Some(overlay) = &quad.text_overlay else {
        return;
    };
    let Some((geometry, paint)) = text_overlay_geometry(quad, overlay) else {
        return;
    };

    let physical_bounds = geometry.physical_bounds;
    let first_vertex = vertices.len() as u32;
    let first_index = indices.len() as u32;
    let overlay_quad = WgpuNativeRenderQuad {
        command_id: format!("{}:label", quad.command_id),
        pipeline: DrawBatchPipeline::Text,
        draw_kind: DrawCommandKind::Text,
        physical_bounds,
        scissor: quad.scissor,
        vertices: quad.vertices,
        indices: quad.indices,
        paint,
        opacity: quad.opacity,
        corner_radius: 0.0,
        border: None,
        text_overlay: None,
        owner_package_id: quad.owner_package_id.clone(),
        required_package_ids: quad.required_package_ids.clone(),
        resource_ids: Vec::new(),
    };
    append_geometry_buffers(geometry, vertices, indices);
    draw_calls.push(WgpuNativeRenderDrawCall::from_quad_range(
        &overlay_quad,
        first_vertex,
        first_index,
        (vertices.len() as u32).saturating_sub(first_vertex),
        (indices.len() as u32).saturating_sub(first_index),
    ));
}

fn text_overlay_geometry(
    quad: &WgpuNativeRenderQuad,
    overlay: &WgpuNativeRenderTextOverlay,
) -> Option<(WgpuNativeRenderBufferGeometry, WgpuNativeRenderPaint)> {
    let color = color_to_rgba(overlay.color);
    let geometry = text_placeholder_geometry(
        quad.physical_bounds,
        &overlay.text,
        &overlay.style,
        color,
        quad.opacity,
    )?;
    let paint = WgpuNativeRenderPaint::TextPlaceholder {
        text: overlay.text.clone(),
        color: overlay.color,
        literal: overlay.literal.clone(),
        style: overlay.style.clone(),
    };
    Some((geometry, paint))
}
