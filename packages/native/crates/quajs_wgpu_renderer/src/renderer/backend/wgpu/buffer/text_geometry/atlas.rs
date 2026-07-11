use crate::fonts::{
    FontBackendAtlasGlyph, FontBackendAtlasLayout, FontBackendAtlasLayoutMap, FontBackendShapedRun,
};
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
use super::placeholder::font_weight_scale;

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
    let embolden_offset =
        ((font_weight_scale(style.font_weight.as_ref()) - 1.0) * font_size * 0.16).max(0.0);
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
        if let Some(run) = shape_text(&line, layout) {
            for (index, shaped) in run.glyphs.iter().enumerate() {
                let glyph = &layout.glyphs_by_id[&shaped.glyph_id];
                physical_bounds = append_atlas_glyph(
                    glyph,
                    cursor_x + shaped.x_offset * scale,
                    baseline - shaped.y_offset * scale,
                    scale,
                    embolden_offset,
                    content_rect,
                    color,
                    &mut vertices,
                    &mut indices,
                    physical_bounds,
                );
                let cluster_ends = run
                    .glyphs
                    .get(index + 1)
                    .map(|next| next.cluster != shaped.cluster)
                    .unwrap_or(true);
                cursor_x +=
                    shaped.x_advance * scale + if cluster_ends { letter_spacing } else { 0.0 };
                if cursor_x >= content_rect.right() {
                    break;
                }
            }
        } else {
            for character in line.chars() {
                let Some(glyph) = layout.glyphs.get(&character) else {
                    continue;
                };
                if !character.is_whitespace() {
                    physical_bounds = append_atlas_glyph(
                        glyph,
                        cursor_x,
                        baseline,
                        scale,
                        embolden_offset,
                        content_rect,
                        color,
                        &mut vertices,
                        &mut indices,
                        physical_bounds,
                    );
                }
                cursor_x += glyph.advance * scale + letter_spacing;
                if cursor_x >= content_rect.right() {
                    break;
                }
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

pub(in crate::renderer::backend::wgpu::buffer) fn atlas_text_is_shaped(
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    atlases: &FontBackendAtlasLayoutMap,
) -> bool {
    if !matches!(style.font_style, FontStyleDrawParam::Normal)
        || !matches!(style.text_decoration, TextDecorationDrawParam::None)
    {
        return false;
    }
    let Some(layout) = select_layout(style, atlases) else {
        return false;
    };
    shape_text(&transform_text(text, style.text_transform), layout).is_some()
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
    if let Some(run) = shape_text(text, layout) {
        return run.advance() * scale
            + run.cluster_count().saturating_sub(1) as f32 * letter_spacing;
    }
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

fn shape_text(text: &str, layout: &FontBackendAtlasLayout) -> Option<FontBackendShapedRun> {
    let run = layout
        .shaping_face
        .as_ref()?
        .shape(text, layout.raster_size)?;
    run.glyphs
        .iter()
        .all(|glyph| glyph.glyph_id != 0 && layout.glyphs_by_id.contains_key(&glyph.glyph_id))
        .then_some(run)
}

#[allow(clippy::too_many_arguments)]
fn append_atlas_glyph(
    glyph: &FontBackendAtlasGlyph,
    cursor_x: f32,
    baseline: f32,
    scale: f32,
    embolden_offset: f32,
    content_rect: FloatRect,
    color: [f32; 4],
    vertices: &mut Vec<WgpuNativeRenderBufferVertex>,
    indices: &mut Vec<u32>,
    physical_bounds: Option<WgpuPhysicalRect>,
) -> Option<WgpuPhysicalRect> {
    if glyph.width <= 0.0 || glyph.height <= 0.0 {
        return physical_bounds;
    }
    let mut physical_bounds = physical_bounds;
    let sample_count = if embolden_offset > 0.0 { 2 } else { 1 };
    for sample_index in 0..sample_count {
        let source = FloatRect {
            x: cursor_x + glyph.bearing_x * scale + embolden_offset * sample_index as f32,
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
    physical_bounds
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

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    use super::*;
    use crate::fonts::FontBackendAtlasGlyph;
    use crate::render_graph::{
        EdgeInsetsDrawParam, FontStyleDrawParam, FontWeightDrawParam, TextAlign,
        TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam,
        WhiteSpaceDrawParam,
    };

    #[test]
    fn emboldens_uploaded_atlas_glyphs_without_changing_the_font_resource() {
        let resource_id = ResourceId::from("fonts:Noto Sans");
        let layout = FontBackendAtlasLayout {
            resource_id: resource_id.clone(),
            family: "Noto Sans".to_string(),
            raster_size: 20.0,
            ascent: 16.0,
            descent: -4.0,
            line_height: 24.0,
            is_default: true,
            glyphs: BTreeMap::from([(
                'A',
                FontBackendAtlasGlyph {
                    uv_top_left: [0.0, 0.0],
                    uv_bottom_right: [0.5, 0.5],
                    advance: 12.0,
                    bearing_x: 0.0,
                    bearing_y: -16.0,
                    width: 11.0,
                    height: 20.0,
                },
            )]),
            glyphs_by_id: BTreeMap::new(),
            shaping_face: None,
        };
        let atlases = BTreeMap::from([(resource_id.clone(), layout)]);
        let regular = style(None);
        let bold = style(Some(FontWeightDrawParam::Number(700)));
        let (regular_geometry, regular_resource) = atlas_text_geometry(
            WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
            "A",
            &regular,
            [1.0; 4],
            1.0,
            &atlases,
        )
        .unwrap();
        let (bold_geometry, bold_resource) = atlas_text_geometry(
            WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
            "A",
            &bold,
            [1.0; 4],
            1.0,
            &atlases,
        )
        .unwrap();

        assert_eq!(regular_geometry.vertices.len(), 4);
        assert_eq!(bold_geometry.vertices.len(), 8);
        assert!(bold_geometry.physical_bounds.width > regular_geometry.physical_bounds.width);
        assert_eq!(regular_resource, resource_id);
        assert_eq!(bold_resource, resource_id);
    }

    #[test]
    fn emits_one_atlas_quad_per_shaped_ligature_glyph() {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let shaping_face = crate::fonts::FontBackendShapingFace::new(bytes, 0).unwrap();
        let run = shaping_face.shape("ffi", 20.0).unwrap();
        assert!(run.glyphs.len() < 3);
        let resource_id = ResourceId::from("fonts:Noto Sans");
        let glyphs_by_id = run
            .glyphs
            .iter()
            .map(|shaped| {
                (
                    shaped.glyph_id,
                    FontBackendAtlasGlyph {
                        uv_top_left: [0.0, 0.0],
                        uv_bottom_right: [0.5, 0.5],
                        advance: shaped.x_advance,
                        bearing_x: 0.0,
                        bearing_y: -16.0,
                        width: 12.0,
                        height: 20.0,
                    },
                )
            })
            .collect();
        let layout = FontBackendAtlasLayout {
            resource_id: resource_id.clone(),
            family: "Noto Sans".to_string(),
            raster_size: 20.0,
            ascent: 16.0,
            descent: -4.0,
            line_height: 24.0,
            is_default: true,
            glyphs: BTreeMap::new(),
            glyphs_by_id,
            shaping_face: Some(shaping_face),
        };
        let atlases = BTreeMap::from([(resource_id, layout)]);
        let (geometry, _) = atlas_text_geometry(
            WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
            "ffi",
            &style(None),
            [1.0; 4],
            1.0,
            &atlases,
        )
        .unwrap();

        assert_eq!(geometry.vertices.len() / 4, run.glyphs.len());
    }

    fn demo_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../demo/assets/fonts/NotoSans-Regular.ttf")
    }

    fn style(font_weight: Option<FontWeightDrawParam>) -> WgpuNativeRenderTextStyle {
        WgpuNativeRenderTextStyle {
            font_family: vec!["Noto Sans".to_string()],
            font_size: 20.0,
            font_style: FontStyleDrawParam::Normal,
            font_weight,
            letter_spacing: 0.0,
            line_height: 24.0,
            align: TextAlign::Left,
            vertical_align: WgpuNativeRenderVerticalAlign::Top,
            text_decoration: TextDecorationDrawParam::None,
            text_overflow: TextOverflowDrawParam::Clip,
            text_transform: TextTransformDrawParam::None,
            white_space: WhiteSpaceDrawParam::Normal,
            padding: EdgeInsetsDrawParam::default(),
        }
    }
}
