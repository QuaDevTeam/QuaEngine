use super::super::primitive::WgpuNativeRenderTextStyle;
use super::geometry::{
    physical_rect_from_float, rect_vertices, union_physical_rect, FloatRect,
    WgpuNativeRenderBufferGeometry,
};
use super::types::WgpuNativeRenderBufferVertex;
use crate::fonts::FontBackendAtlasLayoutMap;
use crate::render_graph::TextOverflowDrawParam;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;
use crate::resources::ResourceId;

pub(crate) mod atlas;
pub(crate) mod bitmap;
mod placeholder;
pub(in crate::renderer::backend::wgpu::buffer::text_geometry) mod width;

use atlas::atlas_text_geometry;
pub(in crate::renderer::backend::wgpu::buffer) use atlas::atlas_text_is_shaped;
pub(in crate::renderer::backend::wgpu::buffer) use atlas::inline_text_geometry;
use bitmap::bitmap_text_geometry;
use placeholder::{
    aligned_line_x, ellipsis_marker_rects, font_style_shear, font_weight_scale, max_visible_lines,
    placeholder_ellipsis_width, placeholder_line_word_gap, placeholder_lines,
    placeholder_word_width, placeholder_words_width, should_justify_placeholder_line,
    text_decoration_rect,
};

pub(super) fn text_placeholder_geometry(
    bounds: WgpuPhysicalRect,
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    mut color: [f32; 4],
    opacity: f32,
    font_atlases: &FontBackendAtlasLayoutMap,
) -> Option<(WgpuNativeRenderBufferGeometry, Option<ResourceId>)> {
    if text.trim().is_empty() {
        return None;
    }
    if let Some((geometry, resource_id)) =
        atlas_text_geometry(bounds, text, style, color, opacity, font_atlases)
    {
        return Some((geometry, Some(resource_id)));
    }
    if let Some(geometry) = bitmap_text_geometry(bounds, text, style, color, opacity) {
        return Some((geometry, None));
    }

    let bounds_rect = FloatRect::from_physical(bounds)?;
    let content_rect = bounds_rect.inset_edges(style.padding)?;
    let font_size = (style.font_size as f32)
        .max(4.0)
        .min(content_rect.height.max(4.0));
    let letter_spacing = (style.letter_spacing as f32).max(0.0);
    let line_height = (style.line_height as f32)
        .max(font_size)
        .min(content_rect.height.max(font_size));
    let weight_scale = font_weight_scale(style.font_weight.as_ref());
    let italic_shear = font_style_shear(style.font_style, font_size);
    let height = (font_size * 0.18 * weight_scale)
        .max(2.0)
        .min(content_rect.height);
    color[3] *= opacity.clamp(0.0, 1.0);

    let lines = placeholder_lines(
        text,
        style,
        content_rect.width,
        font_size,
        letter_spacing,
        weight_scale,
    );
    if lines.is_empty() {
        return None;
    }
    let max_lines = max_visible_lines(content_rect.height, height, line_height).min(lines.len());
    if max_lines == 0 {
        return None;
    }

    let total_height = height + line_height * (max_lines.saturating_sub(1) as f32);
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut physical_bounds = None;

    for (line_index, line) in lines.into_iter().take(max_lines).enumerate() {
        let words = line.words;
        let word_count = words.len();
        let raw_line_width = placeholder_words_width(
            &words,
            font_size,
            letter_spacing,
            weight_scale,
            line.implicit_word_gap,
        );
        let line_overflows = raw_line_width > content_rect.width;
        let show_ellipsis =
            line_overflows && matches!(style.text_overflow, TextOverflowDrawParam::Ellipsis);
        let should_justify_line = line.implicit_word_gap
            && should_justify_placeholder_line(
                style.align,
                word_count,
                line_overflows,
                line_index,
                max_lines,
            );
        let ellipsis_width = if show_ellipsis {
            placeholder_ellipsis_width(font_size)
        } else {
            0.0
        }
        .min(content_rect.width);
        let line_width = if should_justify_line {
            content_rect.width
        } else {
            raw_line_width.min(content_rect.width)
        }
        .max(1.0);
        let mut cursor_x = aligned_line_x(content_rect, line_width, style.align);
        let text_right = (content_rect.right() - ellipsis_width).max(cursor_x);
        let word_gap = placeholder_line_word_gap(
            font_size,
            letter_spacing,
            weight_scale,
            raw_line_width,
            content_rect.width,
            word_count,
            should_justify_line,
            line.implicit_word_gap,
        );
        let y = content_rect.y
            + ((content_rect.height - total_height).max(0.0) * 0.5)
            + line_height * line_index as f32;
        let line_x = cursor_x;

        for word in words {
            let word_width = placeholder_word_width(&word, font_size, letter_spacing, weight_scale)
                .min(text_right - cursor_x);
            if word_width <= 0.0 {
                break;
            }
            if !word.chars().all(char::is_whitespace) {
                let rect = FloatRect {
                    x: cursor_x,
                    y,
                    width: word_width,
                    height,
                };
                let rect_bounds = append_text_placeholder_rect(
                    &mut vertices,
                    &mut indices,
                    rect,
                    bounds_rect,
                    color,
                    italic_shear,
                );
                physical_bounds = union_optional_physical_rect(physical_bounds, rect_bounds);
            }
            cursor_x += word_width + word_gap;
            if cursor_x >= content_rect.right() {
                break;
            }
        }

        if show_ellipsis {
            for marker_rect in ellipsis_marker_rects(content_rect, y, height, font_size) {
                let marker_bounds = append_text_placeholder_rect(
                    &mut vertices,
                    &mut indices,
                    marker_rect,
                    bounds_rect,
                    color,
                    italic_shear,
                );
                physical_bounds = union_optional_physical_rect(physical_bounds, marker_bounds);
            }
        }

        if let Some(decoration_rect) = text_decoration_rect(
            style.text_decoration,
            content_rect,
            line_x,
            y,
            line_width,
            height,
            font_size,
            weight_scale,
        ) {
            let decoration_bounds = append_text_placeholder_rect(
                &mut vertices,
                &mut indices,
                decoration_rect,
                bounds_rect,
                color,
                italic_shear,
            );
            physical_bounds = union_optional_physical_rect(physical_bounds, decoration_bounds);
        }
    }

    Some((
        WgpuNativeRenderBufferGeometry {
            physical_bounds: physical_bounds?,
            vertices,
            indices,
        },
        None,
    ))
}

fn union_optional_physical_rect(
    current: Option<WgpuPhysicalRect>,
    rect: WgpuPhysicalRect,
) -> Option<WgpuPhysicalRect> {
    Some(match current {
        Some(bounds) => union_physical_rect(bounds, rect),
        None => rect,
    })
}

fn append_text_placeholder_rect(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    rect: FloatRect,
    bounds_rect: FloatRect,
    color: [f32; 4],
    shear: f32,
) -> WgpuPhysicalRect {
    let first_vertex = vertices.len() as u32;
    let sheared = sheared_rect(rect, shear);
    vertices.extend(sheared_rect_vertices(rect, sheared, bounds_rect, color));
    indices.extend([
        first_vertex,
        first_vertex + 1,
        first_vertex + 2,
        first_vertex,
        first_vertex + 2,
        first_vertex + 3,
    ]);
    physical_rect_from_float(sheared)
}

fn sheared_rect(rect: FloatRect, shear: f32) -> FloatRect {
    if shear <= 0.0 {
        return rect;
    }

    FloatRect {
        x: rect.x,
        y: rect.y,
        width: rect.width + shear,
        height: rect.height,
    }
}

fn sheared_rect_vertices(
    rect: FloatRect,
    sheared: FloatRect,
    bounds_rect: FloatRect,
    color: [f32; 4],
) -> Vec<WgpuNativeRenderBufferVertex> {
    if sheared.width <= rect.width {
        return rect_vertices(rect, bounds_rect, color);
    }

    let shear = sheared.width - rect.width;
    let mut vertices = rect_vertices(rect, bounds_rect, color);
    vertices[0].position[0] += shear;
    vertices[1].position[0] += shear;
    vertices
}
