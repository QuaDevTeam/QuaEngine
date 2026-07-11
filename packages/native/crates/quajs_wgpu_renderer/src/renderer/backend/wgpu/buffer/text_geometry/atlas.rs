use crate::fonts::{FontBackendAtlasLayout, FontBackendAtlasLayoutMap};
use crate::render_graph::{
    FontStyleDrawParam, TextAlign, TextDecorationDrawParam, TextTransformDrawParam,
    WhiteSpaceDrawParam,
};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;
use crate::resources::ResourceId;

use super::super::super::primitive::{WgpuNativeRenderTextStyle, WgpuNativeRenderVerticalAlign};
use super::super::geometry::{
    physical_rect_from_float, union_physical_rect, FloatRect, WgpuNativeRenderBufferGeometry,
};
use super::super::types::WgpuNativeRenderBufferVertex;

pub(super) fn atlas_text_geometry(
    bounds: WgpuPhysicalRect,
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    mut color: [f32; 4],
    opacity: f32,
    atlases: &FontBackendAtlasLayoutMap,
) -> Option<(WgpuNativeRenderBufferGeometry, ResourceId)> {
    if !matches!(style.font_style, FontStyleDrawParam::Normal)
        || !matches!(style.text_decoration, TextDecorationDrawParam::None)
    {
        return None;
    }
    let layout = select_layout(style, atlases)?;
    let bounds_rect = FloatRect::from_physical(bounds)?;
    let content_rect = bounds_rect.inset_edges(style.padding)?;
    let font_size = (style.font_size as f32)
        .max(1.0)
        .min(content_rect.height.max(1.0));
    let scale = font_size / layout.raster_size.max(1.0);
    let letter_spacing = (style.letter_spacing as f32).max(0.0);
    let line_height = (style.line_height as f32)
        .max(font_size)
        .min(content_rect.height.max(font_size));
    let transformed = transform_text(text, style.text_transform);
    let lines = layout_lines(
        &transformed,
        layout,
        scale,
        letter_spacing,
        content_rect.width,
        style.white_space,
    );
    if lines.is_empty() {
        return None;
    }
    let max_lines = ((content_rect.height / line_height).floor() as usize)
        .max(1)
        .min(lines.len());
    let total_height = font_size + line_height * max_lines.saturating_sub(1) as f32;
    let available_y = (content_rect.height - total_height).max(0.0);
    let start_y = content_rect.y
        + match style.vertical_align {
            WgpuNativeRenderVerticalAlign::Top => 0.0,
            WgpuNativeRenderVerticalAlign::Middle => available_y * 0.5,
            WgpuNativeRenderVerticalAlign::Bottom => available_y,
        };
    color[3] *= opacity.clamp(0.0, 1.0);

    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut physical_bounds = None;
    for (line_index, line) in lines.into_iter().take(max_lines).enumerate() {
        let line_width = measure_text(&line, layout, scale, letter_spacing);
        let mut cursor_x = match style.align {
            TextAlign::Center => content_rect.x + (content_rect.width - line_width).max(0.0) * 0.5,
            TextAlign::Right => content_rect.right() - line_width.min(content_rect.width),
            TextAlign::Left | TextAlign::Justify => content_rect.x,
        };
        let baseline = start_y + line_index as f32 * line_height + layout.ascent * scale;
        for character in line.chars() {
            let Some(glyph) = layout.glyphs.get(&character) else {
                continue;
            };
            if glyph.width > 0.0 && glyph.height > 0.0 && !character.is_whitespace() {
                let source = FloatRect {
                    x: cursor_x + glyph.bearing_x * scale,
                    y: baseline + glyph.bearing_y * scale,
                    width: glyph.width * scale,
                    height: glyph.height * scale,
                };
                if let Some((clipped, uv_top_left, uv_bottom_right)) = clip_glyph(
                    source,
                    content_rect,
                    glyph.uv_top_left,
                    glyph.uv_bottom_right,
                ) {
                    let first_vertex = vertices.len() as u32;
                    vertices.extend(glyph_vertices(clipped, uv_top_left, uv_bottom_right, color));
                    indices.extend_from_slice(&[
                        first_vertex,
                        first_vertex + 1,
                        first_vertex + 2,
                        first_vertex,
                        first_vertex + 2,
                        first_vertex + 3,
                    ]);
                    let rect = physical_rect_from_float(clipped);
                    physical_bounds = Some(match physical_bounds {
                        Some(current) => union_physical_rect(current, rect),
                        None => rect,
                    });
                }
            }
            cursor_x += glyph.advance * scale + letter_spacing;
            if cursor_x >= content_rect.right() {
                break;
            }
        }
    }

    Some((
        WgpuNativeRenderBufferGeometry {
            physical_bounds: physical_bounds?,
            vertices,
            indices,
        },
        layout.resource_id.clone(),
    ))
}

fn select_layout<'a>(
    style: &WgpuNativeRenderTextStyle,
    atlases: &'a FontBackendAtlasLayoutMap,
) -> Option<&'a FontBackendAtlasLayout> {
    for family in &style.font_family {
        let resource_id = ResourceId::from(format!("fonts:{family}"));
        if let Some(layout) = atlases.get(&resource_id) {
            return Some(layout);
        }
    }
    atlases.values().find(|layout| layout.is_default)
}

fn transform_text(text: &str, transform: TextTransformDrawParam) -> String {
    match transform {
        TextTransformDrawParam::Uppercase => text.to_uppercase(),
        TextTransformDrawParam::Lowercase => text.to_lowercase(),
        TextTransformDrawParam::Capitalize => text
            .split_whitespace()
            .map(|word| {
                let mut characters = word.chars();
                characters
                    .next()
                    .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join(" "),
        TextTransformDrawParam::None => text.to_string(),
    }
}

fn layout_lines(
    text: &str,
    layout: &FontBackendAtlasLayout,
    scale: f32,
    letter_spacing: f32,
    max_width: f32,
    white_space: WhiteSpaceDrawParam,
) -> Vec<String> {
    let preserve_newlines = matches!(
        white_space,
        WhiteSpaceDrawParam::Pre | WhiteSpaceDrawParam::PreLine | WhiteSpaceDrawParam::PreWrap
    );
    let wrap = !matches!(
        white_space,
        WhiteSpaceDrawParam::NoWrap | WhiteSpaceDrawParam::Pre
    );
    let normalized = if matches!(
        white_space,
        WhiteSpaceDrawParam::Normal | WhiteSpaceDrawParam::NoWrap
    ) {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        text.to_string()
    };
    let paragraphs = if preserve_newlines {
        normalized.split('\n').collect::<Vec<_>>()
    } else {
        vec![normalized.as_str()]
    };
    let mut lines = Vec::new();
    for paragraph in paragraphs {
        if !wrap {
            lines.push(paragraph.to_string());
            continue;
        }
        let mut line = String::new();
        for character in paragraph.chars() {
            let mut candidate = line.clone();
            candidate.push(character);
            if !line.is_empty()
                && measure_text(&candidate, layout, scale, letter_spacing) > max_width
            {
                lines.push(line);
                line = String::new();
                if character.is_whitespace() {
                    continue;
                }
            }
            line.push(character);
        }
        lines.push(line);
    }
    lines
}

fn measure_text(
    text: &str,
    layout: &FontBackendAtlasLayout,
    scale: f32,
    letter_spacing: f32,
) -> f32 {
    let mut width = 0.0;
    let mut count = 0usize;
    for character in text.chars() {
        if let Some(glyph) = layout.glyphs.get(&character) {
            width += glyph.advance * scale;
            count += 1;
        }
    }
    width + count.saturating_sub(1) as f32 * letter_spacing
}

fn clip_glyph(
    source: FloatRect,
    clip: FloatRect,
    uv_top_left: [f32; 2],
    uv_bottom_right: [f32; 2],
) -> Option<(FloatRect, [f32; 2], [f32; 2])> {
    let left = source.x.max(clip.x);
    let top = source.y.max(clip.y);
    let right = (source.x + source.width).min(clip.x + clip.width);
    let bottom = (source.y + source.height).min(clip.y + clip.height);
    if right <= left || bottom <= top || source.width <= 0.0 || source.height <= 0.0 {
        return None;
    }
    let x0 = (left - source.x) / source.width;
    let y0 = (top - source.y) / source.height;
    let x1 = (right - source.x) / source.width;
    let y1 = (bottom - source.y) / source.height;
    let uv = |from: f32, to: f32, at: f32| from + (to - from) * at;
    Some((
        FloatRect {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        },
        [
            uv(uv_top_left[0], uv_bottom_right[0], x0),
            uv(uv_top_left[1], uv_bottom_right[1], y0),
        ],
        [
            uv(uv_top_left[0], uv_bottom_right[0], x1),
            uv(uv_top_left[1], uv_bottom_right[1], y1),
        ],
    ))
}

fn glyph_vertices(
    rect: FloatRect,
    uv_top_left: [f32; 2],
    uv_bottom_right: [f32; 2],
    color: [f32; 4],
) -> [WgpuNativeRenderBufferVertex; 4] {
    [
        vertex([rect.x, rect.y], uv_top_left, color),
        vertex(
            [rect.x + rect.width, rect.y],
            [uv_bottom_right[0], uv_top_left[1]],
            color,
        ),
        vertex(
            [rect.x + rect.width, rect.y + rect.height],
            uv_bottom_right,
            color,
        ),
        vertex(
            [rect.x, rect.y + rect.height],
            [uv_top_left[0], uv_bottom_right[1]],
            color,
        ),
    ]
}

fn vertex(position: [f32; 2], uv: [f32; 2], color: [f32; 4]) -> WgpuNativeRenderBufferVertex {
    WgpuNativeRenderBufferVertex {
        position,
        uv,
        color,
    }
}
