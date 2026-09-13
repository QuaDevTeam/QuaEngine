use super::super::super::primitive::{WgpuNativeRenderTextStyle, WgpuNativeRenderVerticalAlign};
use super::super::geometry::{FloatRect, WgpuNativeRenderBufferGeometry};
use super::placeholder::{
    aligned_line_x, font_style_shear, font_weight_scale, max_visible_lines,
    should_justify_placeholder_line, text_decoration_rect,
};
use crate::render_graph::TextOverflowDrawParam;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

mod append;
pub(crate) mod glyphs;
mod line;
mod metrics;

use self::append::{append_bitmap_rect, append_bitmap_word, union_optional_physical_rect};
use self::glyphs::BITMAP_GLYPH_HEIGHT;
use self::line::bitmap_lines;
use self::metrics::{
    bitmap_ellipsis_rects, bitmap_ellipsis_width, bitmap_line_word_gap, bitmap_word_width,
    bitmap_words_width, can_use_bitmap_text,
};

pub(super) fn bitmap_text_geometry(
    bounds: WgpuPhysicalRect,
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    mut color: [f32; 4],
    opacity: f32,
) -> Option<WgpuNativeRenderBufferGeometry> {
    if !can_use_bitmap_text(text, style) {
        return None;
    }

    let bounds_rect = FloatRect::from_physical(bounds)?;
    let content_rect = bounds_rect.inset_edges(style.padding)?;
    let font_size = (style.font_size as f32)
        .max(BITMAP_GLYPH_HEIGHT as f32)
        .min(content_rect.height.max(BITMAP_GLYPH_HEIGHT as f32));
    let pixel = (font_size / BITMAP_GLYPH_HEIGHT as f32).max(1.0);
    let letter_spacing = (style.letter_spacing as f32).max(0.0);
    let line_height = (style.line_height as f32)
        .max(font_size)
        .min(content_rect.height.max(font_size));
    let weight_scale = font_weight_scale(style.font_weight.as_ref());
    let glyph_shear = font_style_shear(style.font_style, font_size);
    color[3] *= opacity.clamp(0.0, 1.0);

    let lines = bitmap_lines(
        text,
        style,
        content_rect.width,
        pixel,
        letter_spacing,
        weight_scale,
    );
    if lines.is_empty() {
        return None;
    }
    let max_lines = max_visible_lines(content_rect.height, font_size, line_height).min(lines.len());
    if max_lines == 0 {
        return None;
    }

    let total_height = font_size + line_height * (max_lines.saturating_sub(1) as f32);
    let available_y = (content_rect.height - total_height).max(0.0);
    let start_y = content_rect.y
        + match style.vertical_align {
            WgpuNativeRenderVerticalAlign::Top => 0.0,
            WgpuNativeRenderVerticalAlign::Middle => available_y * 0.5,
            WgpuNativeRenderVerticalAlign::Bottom => available_y,
        };
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut physical_bounds = None;

    for (line_index, line) in lines.into_iter().take(max_lines).enumerate() {
        let words = line.words;
        let word_count = words.len();
        let raw_line_width = bitmap_words_width(
            &words,
            pixel,
            letter_spacing,
            weight_scale,
            line.implicit_word_gap,
        ) + if word_count > 0 { glyph_shear } else { 0.0 };
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
            bitmap_ellipsis_width(pixel)
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
        let line_x = aligned_line_x(content_rect, line_width, style.align);
        let mut cursor_x = line_x;
        let text_right = (content_rect.right() - ellipsis_width).max(cursor_x);
        let word_gap = bitmap_line_word_gap(
            pixel,
            letter_spacing,
            weight_scale,
            raw_line_width,
            content_rect.width,
            word_count,
            should_justify_line,
            line.implicit_word_gap,
        );
        let y = start_y + line_height * line_index as f32;

        for word in words {
            if cursor_x >= text_right {
                break;
            }
            let word_bounds = append_bitmap_word(
                &mut vertices,
                &mut indices,
                &word,
                cursor_x,
                y,
                pixel,
                letter_spacing,
                weight_scale,
                content_rect,
                color,
                text_right,
                glyph_shear,
            );
            physical_bounds = union_optional_physical_rect(physical_bounds, word_bounds);
            cursor_x += bitmap_word_width(&word, pixel, letter_spacing, weight_scale) + word_gap;
        }

        if show_ellipsis {
            for marker_rect in bitmap_ellipsis_rects(content_rect, y, font_size, pixel) {
                let marker_bounds =
                    append_bitmap_rect(&mut vertices, &mut indices, marker_rect, color);
                physical_bounds =
                    union_optional_physical_rect(physical_bounds, Some(marker_bounds));
            }
        }

        if let Some(decoration_rect) = text_decoration_rect(
            style.text_decoration,
            content_rect,
            line_x,
            y,
            line_width,
            font_size,
            font_size,
            weight_scale,
        ) {
            let decoration_bounds =
                append_bitmap_rect(&mut vertices, &mut indices, decoration_rect, color);
            physical_bounds =
                union_optional_physical_rect(physical_bounds, Some(decoration_bounds));
        }
    }

    Some(WgpuNativeRenderBufferGeometry {
        physical_bounds: physical_bounds?,
        vertices,
        indices,
    })
}
