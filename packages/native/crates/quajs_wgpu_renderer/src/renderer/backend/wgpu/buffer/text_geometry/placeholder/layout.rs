use super::metrics::{placeholder_ellipsis_dot_gap, placeholder_ellipsis_dot_size};
use crate::render_graph::{TextAlign, TextDecorationDrawParam};
use crate::renderer::backend::wgpu::buffer::geometry::FloatRect;

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn aligned_line_x(
    content_rect: FloatRect,
    line_width: f32,
    align: TextAlign,
) -> f32 {
    match align {
        TextAlign::Left | TextAlign::Justify => content_rect.x,
        TextAlign::Right => content_rect.right() - line_width,
        TextAlign::Center => content_rect.x + (content_rect.width - line_width) * 0.5,
    }
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn ellipsis_marker_rects(
    content_rect: FloatRect,
    y: f32,
    text_height: f32,
    font_size: f32,
) -> Vec<FloatRect> {
    let dot = placeholder_ellipsis_dot_size(font_size).min(content_rect.height);
    let gap = placeholder_ellipsis_dot_gap(font_size);
    let total_width = dot * 3.0 + gap * 2.0;
    if content_rect.width < total_width || dot <= 0.0 {
        return Vec::new();
    }

    let start_x = content_rect.right() - total_width;
    let dot_y = (y + (text_height - dot) * 0.5)
        .max(content_rect.y)
        .min(content_rect.y + content_rect.height - dot);

    (0..3)
        .map(|index| FloatRect {
            x: start_x + index as f32 * (dot + gap),
            y: dot_y,
            width: dot,
            height: dot,
        })
        .collect()
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn text_decoration_rect(
    decoration: TextDecorationDrawParam,
    content_rect: FloatRect,
    x: f32,
    y: f32,
    line_width: f32,
    text_height: f32,
    font_size: f32,
    weight_scale: f32,
) -> Option<FloatRect> {
    let thickness = (font_size * 0.08 * weight_scale)
        .max(1.0)
        .min(content_rect.height);
    let y = match decoration {
        TextDecorationDrawParam::None => return None,
        TextDecorationDrawParam::Underline => {
            (y + text_height + thickness).min(content_rect.y + content_rect.height - thickness)
        }
        TextDecorationDrawParam::LineThrough => y + (text_height - thickness) * 0.5,
    };
    if line_width <= 0.0
        || y < content_rect.y
        || y + thickness > content_rect.y + content_rect.height
    {
        return None;
    }

    Some(FloatRect {
        x,
        y,
        width: line_width.min(content_rect.right() - x).max(1.0),
        height: thickness,
    })
}
