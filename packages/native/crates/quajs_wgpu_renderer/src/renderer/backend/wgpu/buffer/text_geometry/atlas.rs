use crate::fonts::{
    FontBackendAtlasFaceLayout, FontBackendAtlasGlyph, FontBackendAtlasLayout,
    FontBackendAtlasLayoutMap, FontBackendShapedRun, FontBackendShapingFace,
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
    if !matches!(style.text_decoration, TextDecorationDrawParam::None) {
        return None;
    }
    let layout = select_layout(style, atlases)?;
    if matches!(style.font_style, FontStyleDrawParam::Italic)
        && !atlas_faces(layout)
            .iter()
            .any(|face| face_style_matches(face, style))
    {
        return None;
    }
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
        style,
    );
    if lines.is_empty() {
        return None;
    }
    let max_lines = ((content_rect.height / line_height).floor() as usize)
        .max(1)
        .min(lines.len());
    let total_height = font_size + line_height * max_lines.saturating_sub(1) as f32;
    let requested_embolden_offset =
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
        let line_width = measure_text(&line, layout, scale, letter_spacing, style);
        let mut cursor_x = match style.align {
            TextAlign::Center => content_rect.x + (content_rect.width - line_width).max(0.0) * 0.5,
            TextAlign::Right => content_rect.right() - line_width.min(content_rect.width),
            TextAlign::Left | TextAlign::Justify => content_rect.x,
        };
        let baseline = start_y + line_index as f32 * line_height + layout.ascent * scale;
        if let Some(shaped_text) = shape_text(&line, layout, style) {
            let embolden_offset = if shaped_text.needs_synthetic_bold {
                requested_embolden_offset
            } else {
                0.0
            };
            for (index, shaped) in shaped_text.run.glyphs.iter().enumerate() {
                let glyph = &shaped_text.glyphs[&shaped.glyph_id];
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
                let cluster_ends = shaped_text
                    .run
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
                        requested_embolden_offset,
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
    if !matches!(style.text_decoration, TextDecorationDrawParam::None) {
        return false;
    }
    let Some(layout) = select_layout(style, atlases) else {
        return false;
    };
    if matches!(style.font_style, FontStyleDrawParam::Italic)
        && !atlas_faces(layout)
            .iter()
            .any(|face| face_style_matches(face, style))
    {
        return false;
    }
    shape_text(&transform_text(text, style.text_transform), layout, style).is_some()
}

fn select_layout<'a>(
    style: &WgpuNativeRenderTextStyle,
    atlases: &'a FontBackendAtlasLayoutMap,
) -> Option<&'a FontBackendAtlasLayout> {
    if style
        .font_family
        .iter()
        .any(|family| family == crate::fonts::NATIVE_BITMAP_FONT_FAMILY)
    {
        return None;
    }
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
    style: &WgpuNativeRenderTextStyle,
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
        lines.extend(wrap_paragraph(
            paragraph,
            layout,
            scale,
            letter_spacing,
            max_width,
            style,
        ));
    }
    lines
}

fn wrap_paragraph(
    paragraph: &str,
    layout: &FontBackendAtlasLayout,
    scale: f32,
    letter_spacing: f32,
    max_width: f32,
    style: &WgpuNativeRenderTextStyle,
) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    let mut segment_start = 0usize;
    for (segment_end, _) in unicode_linebreak::linebreaks(paragraph) {
        let Some(segment) = paragraph.get(segment_start..segment_end) else {
            continue;
        };
        segment_start = segment_end;
        let mut candidate = line.clone();
        candidate.push_str(segment);
        if !line.is_empty()
            && measure_text(&candidate, layout, scale, letter_spacing, style) > max_width
        {
            lines.push(line.trim_end_matches(char::is_whitespace).to_string());
            line.clear();
        }
        let segment = if line.is_empty() {
            segment.trim_start_matches(char::is_whitespace)
        } else {
            segment
        };
        if measure_text(segment, layout, scale, letter_spacing, style) > max_width {
            append_oversized_segment(
                &mut lines,
                &mut line,
                segment,
                layout,
                scale,
                letter_spacing,
                max_width,
                style,
            );
        } else {
            line.push_str(segment);
        }
    }
    if !line.is_empty() || lines.is_empty() {
        lines.push(line);
    }
    lines
}

#[allow(clippy::too_many_arguments)]
fn append_oversized_segment(
    lines: &mut Vec<String>,
    line: &mut String,
    segment: &str,
    layout: &FontBackendAtlasLayout,
    scale: f32,
    letter_spacing: f32,
    max_width: f32,
    style: &WgpuNativeRenderTextStyle,
) {
    for character in segment.chars() {
        let mut candidate = line.clone();
        candidate.push(character);
        if !line.is_empty()
            && measure_text(&candidate, layout, scale, letter_spacing, style) > max_width
        {
            lines.push(std::mem::take(line));
            if character.is_whitespace() {
                continue;
            }
        }
        line.push(character);
    }
}

fn measure_text(
    text: &str,
    layout: &FontBackendAtlasLayout,
    scale: f32,
    letter_spacing: f32,
    style: &WgpuNativeRenderTextStyle,
) -> f32 {
    if let Some(shaped) = shape_text(text, layout, style) {
        return shaped.run.advance() * scale
            + shaped.run.cluster_count().saturating_sub(1) as f32 * letter_spacing;
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

struct AtlasShapedText<'a> {
    run: FontBackendShapedRun,
    glyphs: &'a std::collections::BTreeMap<u32, FontBackendAtlasGlyph>,
    needs_synthetic_bold: bool,
}

fn shape_text<'a>(
    text: &str,
    layout: &'a FontBackendAtlasLayout,
    style: &WgpuNativeRenderTextStyle,
) -> Option<AtlasShapedText<'a>> {
    let requested_weight = requested_font_weight(style);
    let mut faces = atlas_faces(layout).iter().collect::<Vec<_>>();
    faces.sort_by_key(|face| face_selection_score(face, style));
    for face in faces {
        let Some(run) = face.shaping_face.shape(text, layout.raster_size) else {
            continue;
        };
        if shaped_run_is_available(&run, &face.glyphs_by_id) {
            return Some(AtlasShapedText {
                run,
                glyphs: &face.glyphs_by_id,
                needs_synthetic_bold: requested_weight >= 600
                    && font_weight_value(face.weight.as_deref()) < 600,
            });
        }
    }

    let run = layout
        .shaping_face
        .as_ref()?
        .shape(text, layout.raster_size)?;
    shaped_run_is_available(&run, &layout.glyphs_by_id).then_some(AtlasShapedText {
        run,
        glyphs: &layout.glyphs_by_id,
        needs_synthetic_bold: requested_weight >= 600,
    })
}

fn atlas_faces(layout: &FontBackendAtlasLayout) -> &[FontBackendAtlasFaceLayout] {
    layout
        .shaping_face
        .as_ref()
        .map(FontBackendShapingFace::atlas_faces)
        .unwrap_or_default()
}

fn shaped_run_is_available(
    run: &FontBackendShapedRun,
    glyphs: &std::collections::BTreeMap<u32, FontBackendAtlasGlyph>,
) -> bool {
    run.glyphs
        .iter()
        .all(|glyph| glyph.glyph_id != 0 && glyphs.contains_key(&glyph.glyph_id))
}

fn face_selection_score(
    face: &FontBackendAtlasFaceLayout,
    style: &WgpuNativeRenderTextStyle,
) -> (u8, u16) {
    let style_penalty = u8::from(!face_style_matches(face, style));
    let weight_distance =
        font_weight_value(face.weight.as_deref()).abs_diff(requested_font_weight(style));
    (style_penalty, weight_distance)
}

fn face_style_matches(
    face: &FontBackendAtlasFaceLayout,
    style: &WgpuNativeRenderTextStyle,
) -> bool {
    let face_style = face.style.as_deref().unwrap_or("normal");
    match style.font_style {
        FontStyleDrawParam::Normal => face_style.eq_ignore_ascii_case("normal"),
        FontStyleDrawParam::Italic => {
            face_style.eq_ignore_ascii_case("italic") || face_style.eq_ignore_ascii_case("oblique")
        }
    }
}

fn requested_font_weight(style: &WgpuNativeRenderTextStyle) -> u16 {
    match style.font_weight.as_ref() {
        Some(crate::render_graph::FontWeightDrawParam::Number(weight)) => *weight,
        Some(crate::render_graph::FontWeightDrawParam::Keyword(weight)) => {
            font_weight_value(Some(weight))
        }
        None => 400,
    }
}

fn font_weight_value(weight: Option<&str>) -> u16 {
    match weight.map(str::trim) {
        Some(weight) if weight.eq_ignore_ascii_case("bold") => 700,
        Some(weight) if weight.eq_ignore_ascii_case("normal") => 400,
        Some(weight) => weight.parse().unwrap_or(400),
        None => 400,
    }
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
        effect0: [0.0; 4],
        effect1: [0.0; 4],
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

    #[test]
    fn selects_family_face_by_style_then_weight() {
        let regular = atlas_face("regular", Some("normal"), Some("400"), "office", false);
        let bold = atlas_face("bold", Some("normal"), Some("700"), "office", false);
        let italic = atlas_face("italic", Some("italic"), Some("400"), "office", false);
        let layout = atlas_layout_with_faces(vec![regular, bold, italic], "office");

        let bold_style = style(Some(FontWeightDrawParam::Number(700)));
        let shaped = shape_text("office", &layout, &bold_style).unwrap();
        assert!(std::ptr::eq(
            shaped.glyphs,
            &atlas_faces(&layout)[1].glyphs_by_id
        ));
        assert!(!shaped.needs_synthetic_bold);

        let mut italic_style = style(None);
        italic_style.font_style = FontStyleDrawParam::Italic;
        let shaped = shape_text("office", &layout, &italic_style).unwrap();
        assert!(std::ptr::eq(
            shaped.glyphs,
            &atlas_faces(&layout)[2].glyphs_by_id
        ));
    }

    #[test]
    fn falls_back_to_another_family_face_when_preferred_face_is_missing_glyphs() {
        let bold = atlas_face("bold", Some("normal"), Some("700"), "office", true);
        let regular = atlas_face("regular", Some("normal"), Some("400"), "office", false);
        let layout = atlas_layout_with_faces(vec![bold, regular], "office");
        let bold_style = style(Some(FontWeightDrawParam::Number(700)));

        let shaped = shape_text("office", &layout, &bold_style).unwrap();

        assert!(std::ptr::eq(
            shaped.glyphs,
            &atlas_faces(&layout)[1].glyphs_by_id
        ));
        assert!(shaped.needs_synthetic_bold);
    }

    #[test]
    fn unicode_line_breaking_keeps_cjk_closing_punctuation_off_line_start() {
        let resource_id = ResourceId::from("fonts:Noto Sans");
        let glyph = FontBackendAtlasGlyph {
            uv_top_left: [0.0, 0.0],
            uv_bottom_right: [0.5, 0.5],
            advance: 10.0,
            bearing_x: 0.0,
            bearing_y: -8.0,
            width: 9.0,
            height: 10.0,
        };
        let layout = FontBackendAtlasLayout {
            resource_id,
            family: "Noto Sans".to_string(),
            raster_size: 10.0,
            ascent: 8.0,
            descent: -2.0,
            line_height: 12.0,
            is_default: true,
            glyphs: "你好，世界"
                .chars()
                .map(|character| (character, glyph.clone()))
                .collect(),
            glyphs_by_id: BTreeMap::new(),
            shaping_face: None,
        };

        let lines = layout_lines(
            "你好，世界",
            &layout,
            1.0,
            0.0,
            20.0,
            WhiteSpaceDrawParam::Normal,
            &style(None),
        );

        assert!(lines.len() > 1);
        assert!(lines.iter().all(|line| !line.starts_with('，')));
    }

    fn demo_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../demo/assets/fonts/NotoSans-Regular.ttf")
    }

    fn atlas_face(
        face_id: &str,
        face_style: Option<&str>,
        weight: Option<&str>,
        text: &str,
        omit_glyphs: bool,
    ) -> FontBackendAtlasFaceLayout {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let shaping_face = crate::fonts::FontBackendShapingFace::new(bytes, 0).unwrap();
        let run = shaping_face.shape(text, 20.0).unwrap();
        let glyphs_by_id = if omit_glyphs {
            BTreeMap::new()
        } else {
            run.glyphs
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
                .collect()
        };
        FontBackendAtlasFaceLayout {
            face_id: face_id.to_string(),
            style: face_style.map(ToString::to_string),
            weight: weight.map(ToString::to_string),
            glyphs_by_id,
            shaping_face: Box::new(shaping_face),
        }
    }

    fn atlas_layout_with_faces(
        faces: Vec<FontBackendAtlasFaceLayout>,
        text: &str,
    ) -> FontBackendAtlasLayout {
        let primary = (*faces[0].shaping_face).clone();
        let run = primary.shape(text, 20.0).unwrap();
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
        FontBackendAtlasLayout {
            resource_id: ResourceId::from("fonts:Noto Sans"),
            family: "Noto Sans".to_string(),
            raster_size: 20.0,
            ascent: 16.0,
            descent: -4.0,
            line_height: 24.0,
            is_default: true,
            glyphs: BTreeMap::new(),
            glyphs_by_id,
            shaping_face: Some(primary.with_atlas_faces(faces)),
        }
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
            blur_radius: 0.0,
            padding: EdgeInsetsDrawParam::default(),
        }
    }
}
