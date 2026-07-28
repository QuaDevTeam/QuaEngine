use super::glyphs::{
    bitmap_glyph_uv_bounds, bitmap_solid_uv_bounds, BitmapAtlasUvBounds, BITMAP_GLYPH_HEIGHT,
};
use super::metrics::{bitmap_glyph_advance, bitmap_glyph_width};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

use super::super::super::geometry::{union_physical_rect, FloatRect};
use super::super::super::types::WgpuNativeRenderBufferVertex;
use super::super::width::is_zero_width_text_character;

pub(super) fn append_bitmap_word(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    word: &str,
    mut cursor_x: f32,
    y: f32,
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
    content_rect: FloatRect,
    color: [f32; 4],
    text_right: f32,
    glyph_shear: f32,
) -> Option<WgpuPhysicalRect> {
    let mut physical_bounds = None;
    for character in word.chars() {
        if cursor_x >= text_right {
            break;
        }
        if !character.is_whitespace() && !is_zero_width_text_character(character) {
            let glyph_bounds = if bitmap_glyph_uv_bounds(character).is_some() {
                append_bitmap_glyph(
                    vertices,
                    indices,
                    character,
                    cursor_x,
                    y,
                    pixel,
                    weight_scale,
                    content_rect,
                    color,
                    text_right,
                    glyph_shear,
                )
            } else {
                append_bitmap_fallback_glyph(
                    vertices,
                    indices,
                    character,
                    cursor_x,
                    y,
                    pixel,
                    weight_scale,
                    content_rect,
                    color,
                    text_right,
                    glyph_shear,
                )
            };
            physical_bounds = union_optional_physical_rect(physical_bounds, glyph_bounds);
        }
        cursor_x += bitmap_glyph_advance(character, pixel, letter_spacing, weight_scale);
    }
    physical_bounds
}

pub(super) fn append_bitmap_rect(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    rect: FloatRect,
    color: [f32; 4],
) -> WgpuPhysicalRect {
    append_bitmap_textured_rect(
        vertices,
        indices,
        rect,
        rect,
        bitmap_solid_uv_bounds(),
        color,
        0.0,
    )
}

pub(super) fn union_optional_physical_rect(
    current: Option<WgpuPhysicalRect>,
    rect: Option<WgpuPhysicalRect>,
) -> Option<WgpuPhysicalRect> {
    match (current, rect) {
        (Some(left), Some(right)) => Some(union_physical_rect(left, right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn append_bitmap_glyph(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    character: char,
    x: f32,
    y: f32,
    pixel: f32,
    weight_scale: f32,
    content_rect: FloatRect,
    color: [f32; 4],
    text_right: f32,
    glyph_shear: f32,
) -> Option<WgpuPhysicalRect> {
    let uv_bounds = bitmap_glyph_uv_bounds(character)?;
    append_bitmap_glyph_rect(
        vertices,
        indices,
        x,
        y,
        pixel,
        content_rect,
        color,
        text_right,
        glyph_shear,
        bitmap_glyph_width(character, pixel, weight_scale),
        uv_bounds,
    )
}

fn append_bitmap_fallback_glyph(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    character: char,
    x: f32,
    y: f32,
    pixel: f32,
    weight_scale: f32,
    content_rect: FloatRect,
    color: [f32; 4],
    text_right: f32,
    glyph_shear: f32,
) -> Option<WgpuPhysicalRect> {
    append_bitmap_glyph_rect(
        vertices,
        indices,
        x,
        y,
        pixel,
        content_rect,
        color,
        text_right,
        glyph_shear,
        bitmap_glyph_width(character, pixel, weight_scale),
        bitmap_solid_uv_bounds(),
    )
}

fn append_bitmap_glyph_rect(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    x: f32,
    y: f32,
    pixel: f32,
    content_rect: FloatRect,
    color: [f32; 4],
    text_right: f32,
    glyph_shear: f32,
    glyph_width: f32,
    uv_bounds: BitmapAtlasUvBounds,
) -> Option<WgpuPhysicalRect> {
    let rect = FloatRect {
        x,
        y,
        width: glyph_width.max(1.0),
        height: BITMAP_GLYPH_HEIGHT as f32 * pixel,
    };
    let clipped = clip_bitmap_rect(rect, content_rect, text_right)?;
    Some(append_bitmap_textured_rect(
        vertices,
        indices,
        clipped,
        rect,
        uv_bounds,
        color,
        glyph_shear,
    ))
}

fn append_bitmap_textured_rect(
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    rect: FloatRect,
    source_rect: FloatRect,
    uv_bounds: BitmapAtlasUvBounds,
    color: [f32; 4],
    top_shear: f32,
) -> WgpuPhysicalRect {
    let first_vertex = vertices.len() as u32;
    vertices.extend(bitmap_textured_rect_vertices(
        rect,
        source_rect,
        uv_bounds,
        color,
        top_shear,
    ));
    indices.extend([
        first_vertex,
        first_vertex + 1,
        first_vertex + 2,
        first_vertex,
        first_vertex + 2,
        first_vertex + 3,
    ]);
    physical_rect_from_textured_rect(rect, top_shear)
}

fn bitmap_textured_rect_vertices(
    rect: FloatRect,
    source_rect: FloatRect,
    uv_bounds: BitmapAtlasUvBounds,
    color: [f32; 4],
    top_shear: f32,
) -> [WgpuNativeRenderBufferVertex; 4] {
    let left_t = ((rect.x - source_rect.x) / source_rect.width).clamp(0.0, 1.0);
    let right_t = ((rect.right() - source_rect.x) / source_rect.width).clamp(0.0, 1.0);
    let top_t = ((rect.y - source_rect.y) / source_rect.height).clamp(0.0, 1.0);
    let bottom_t = ((rect.y + rect.height - source_rect.y) / source_rect.height).clamp(0.0, 1.0);
    let top_offset = shear_at_y(top_shear, top_t);
    let bottom_offset = shear_at_y(top_shear, bottom_t);
    [
        bitmap_vertex(
            [rect.x + top_offset, rect.y],
            atlas_uv(uv_bounds, left_t, top_t),
            color,
        ),
        bitmap_vertex(
            [rect.right() + top_offset, rect.y],
            atlas_uv(uv_bounds, right_t, top_t),
            color,
        ),
        bitmap_vertex(
            [rect.right() + bottom_offset, rect.y + rect.height],
            atlas_uv(uv_bounds, right_t, bottom_t),
            color,
        ),
        bitmap_vertex(
            [rect.x + bottom_offset, rect.y + rect.height],
            atlas_uv(uv_bounds, left_t, bottom_t),
            color,
        ),
    ]
}

fn bitmap_vertex(
    position: [f32; 2],
    uv: [f32; 2],
    color: [f32; 4],
) -> WgpuNativeRenderBufferVertex {
    WgpuNativeRenderBufferVertex {
        position,
        uv,
        color,
        effect0: [0.0; 4],
        effect1: [0.0; 4],
        effect2: [0.0; 4],
    }
}

fn atlas_uv(bounds: BitmapAtlasUvBounds, x_t: f32, y_t: f32) -> [f32; 2] {
    [
        bounds.top_left[0] + (bounds.bottom_right[0] - bounds.top_left[0]) * x_t,
        bounds.top_left[1] + (bounds.bottom_right[1] - bounds.top_left[1]) * y_t,
    ]
}

fn shear_at_y(top_shear: f32, y_t: f32) -> f32 {
    if top_shear <= 0.0 {
        return 0.0;
    }
    top_shear * (1.0 - y_t.clamp(0.0, 1.0))
}

fn physical_rect_from_textured_rect(rect: FloatRect, top_shear: f32) -> WgpuPhysicalRect {
    let left = rect.x.min(rect.x + top_shear).floor().max(0.0);
    let top = rect.y.floor().max(0.0);
    let right = rect.right().max(rect.right() + top_shear).ceil().max(left);
    let bottom = (rect.y + rect.height).ceil().max(top);

    WgpuPhysicalRect {
        x: left as u32,
        y: top as u32,
        width: (right - left) as u32,
        height: (bottom - top) as u32,
    }
}

fn clip_bitmap_rect(
    rect: FloatRect,
    content_rect: FloatRect,
    text_right: f32,
) -> Option<FloatRect> {
    let left = rect.x.max(content_rect.x);
    let top = rect.y.max(content_rect.y);
    let right = rect.right().min(content_rect.right()).min(text_right);
    let bottom = (rect.y + rect.height).min(content_rect.y + content_rect.height);
    let width = right - left;
    let height = bottom - top;
    if width <= 0.0 || height <= 0.0 {
        return None;
    }

    Some(FloatRect {
        x: left,
        y: top,
        width,
        height,
    })
}
