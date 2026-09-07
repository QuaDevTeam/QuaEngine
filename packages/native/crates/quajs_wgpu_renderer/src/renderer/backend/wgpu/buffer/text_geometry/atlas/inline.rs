use super::*;
use crate::render_graph::{InlineTextRun, InlineTextStyle};
use crate::renderer::backend::wgpu::mesh::{parse_color_literal, WgpuNativeRenderPaint};

struct RunBox<'a> {
    run: &'a InlineTextRun,
    style: WgpuNativeRenderTextStyle,
    atlas: &'a FontBackendAtlasLayout,
    lines: Vec<AtlasTextLine>,
    width: f32,
    height: f32,
    // CSS inline-block exposes the baseline of its last line box.
    baseline: f32,
}

struct PositionedRun<'a> {
    item: RunBox<'a>,
    x: f32,
    y: f32,
}

fn line_metrics(style: &WgpuNativeRenderTextStyle, atlas: &FontBackendAtlasLayout) -> (f32, f32) {
    let scale = style.font_size as f32 / atlas.raster_size.max(1.0);
    let height = style.line_height.max(0.0) as f32;
    let baseline = (height - (atlas.ascent - atlas.descent) * scale) * 0.5 + atlas.ascent * scale;
    (height, baseline)
}

fn resolve_style<'a>(
    inline: &InlineTextStyle,
    parent: &WgpuNativeRenderTextStyle,
    atlases: &'a FontBackendAtlasLayoutMap,
) -> Option<(WgpuNativeRenderTextStyle, &'a FontBackendAtlasLayout)> {
    let mut style = parent.clone();
    style.inline = None;
    style.font_family = inline.font_family.clone();
    style.font_size = inline.font_size;
    style.font_weight = inline.font_weight.clone();
    style.line_height = inline.line_height;
    style.align = inline.align;
    let atlas = select_layout(&style, atlases)?;
    if inline.normal_line_height {
        style.line_height =
            f64::from(atlas.line_height / atlas.raster_size.max(1.0)) * style.font_size;
    }
    Some((style, atlas))
}

fn run_box<'a>(
    run: &'a InlineTextRun,
    parent: &WgpuNativeRenderTextStyle,
    atlases: &'a FontBackendAtlasLayoutMap,
    available: f32,
) -> Option<RunBox<'a>> {
    let (style, atlas) = resolve_style(&run.style, parent, atlases)?;
    let scale = style.font_size as f32 / atlas.raster_size.max(1.0);
    let measure =
        |text: &str| measure_text(text, atlas, scale, style.letter_spacing as f32, &style);
    // Match Web's inline-block with pre-wrap/overflow-wrap:anywhere: shrink
    // to max-content when it fits, otherwise wrap inside the containing block.
    let width = run
        .text
        .split('\n')
        .map(measure)
        .fold(0.0_f32, f32::max)
        .min(available);
    let lines = if run.text.is_empty() {
        Vec::new()
    } else if style.white_space == WhiteSpaceDrawParam::PreWrap {
        pre_wrap_lines(&run.text, width.max(0.01), measure)
    } else {
        layout_lines(
            &run.text,
            atlas,
            scale,
            style.letter_spacing as f32,
            width.max(0.01),
            style.white_space,
            &style,
        )
    };
    let (line_height, baseline) = line_metrics(&style, atlas);
    let height = line_height * lines.len() as f32;
    let baseline = if lines.is_empty() {
        0.0
    } else {
        baseline + line_height * lines.len().saturating_sub(1) as f32
    };
    Some(RunBox {
        run,
        style,
        atlas,
        lines,
        width,
        height,
        baseline,
    })
}

// Unlike collapsed white-space wrapping, pre-wrap keeps authored spaces at
// span/line starts. Those spaces carry advances even though they paint no ink.
fn pre_wrap_lines(text: &str, width: f32, measure: impl Fn(&str) -> f32) -> Vec<AtlasTextLine> {
    let mut lines = Vec::new();
    for paragraph in text.split('\n') {
        let mut line = String::new();
        let mut start = 0;
        for (end, _) in unicode_linebreak::linebreaks(paragraph) {
            let segment = &paragraph[start..end];
            start = end;
            // CSS pre-wrap lets trailing spaces hang at a soft wrap. They
            // remain in the source so reveal offsets and advances stay exact.
            let candidate = format!("{line}{segment}");
            if !line.is_empty() && measure(candidate.trim_end_matches([' ', '\t'])) > width {
                lines.push(AtlasTextLine {
                    text: std::mem::take(&mut line),
                    soft_wrapped: true,
                });
            }
            if measure(segment.trim_end_matches([' ', '\t'])) > width {
                for grapheme in segment.graphemes(true) {
                    let candidate = format!("{line}{grapheme}");
                    if !line.is_empty() && measure(candidate.trim_end_matches([' ', '\t'])) > width
                    {
                        lines.push(AtlasTextLine {
                            text: std::mem::take(&mut line),
                            soft_wrapped: true,
                        });
                    }
                    line.push_str(grapheme);
                }
            } else {
                line.push_str(segment);
            }
        }
        lines.push(AtlasTextLine {
            text: line,
            soft_wrapped: false,
        });
    }
    lines
}

fn layout_inline<'a>(
    style: &WgpuNativeRenderTextStyle,
    atlases: &'a FontBackendAtlasLayoutMap,
    inline: &'a crate::render_graph::InlineTextDrawParams,
    width: f32,
) -> Option<(Vec<PositionedRun<'a>>, f32)> {
    let mut positioned = Vec::new();
    let mut top = 0.0;
    for block in &inline.blocks {
        let (base, root) = resolve_style(&block.style, style, atlases)?;
        let (strut_height, strut_baseline) = line_metrics(&base, root);
        let mut row = Vec::new();
        let mut used = 0.0;
        for run in &block.runs {
            let item = run_box(run, &base, atlases, width)?;
            if !row.is_empty() && used + item.width > width + 0.001 {
                top += finish_row(
                    &mut positioned,
                    &mut row,
                    used,
                    width,
                    top,
                    strut_baseline,
                    strut_height - strut_baseline,
                    base.align,
                );
                used = 0.0;
            }
            used += item.width;
            row.push(item);
        }
        if !row.is_empty() {
            top += finish_row(
                &mut positioned,
                &mut row,
                used,
                width,
                top,
                strut_baseline,
                strut_height - strut_baseline,
                base.align,
            );
        }
    }
    Some((positioned, top))
}

#[allow(clippy::too_many_arguments)]
fn finish_row<'a>(
    positioned: &mut Vec<PositionedRun<'a>>,
    row: &mut Vec<RunBox<'a>>,
    used: f32,
    width: f32,
    top: f32,
    strut_ascent: f32,
    strut_descent: f32,
    align: TextAlign,
) -> f32 {
    let ascent = row.iter().map(|r| r.baseline).fold(strut_ascent, f32::max);
    let descent = row
        .iter()
        .map(|r| r.height - r.baseline)
        .fold(strut_descent, f32::max);
    let mut x = match align {
        TextAlign::Center => (width - used).max(0.0) * 0.5,
        TextAlign::Right => (width - used).max(0.0),
        _ => 0.0,
    };
    for item in row.drain(..) {
        let next_x = x + item.width;
        let y = top + ascent - item.baseline;
        positioned.push(PositionedRun { item, x, y });
        x = next_x;
    }
    ascent + descent
}

pub(crate) fn measure_inline_height(
    params: &crate::render_graph::TextDrawParams,
    width: f64,
    physical_scale: f64,
    atlases: &FontBackendAtlasLayoutMap,
) -> Option<f64> {
    if !physical_scale.is_finite() || physical_scale <= 0.0 || !width.is_finite() || width <= 0.0 {
        return None;
    }
    let style = WgpuNativeRenderTextStyle::from_text_params(params, physical_scale);
    let width = (width * physical_scale - style.padding.left - style.padding.right) as f32;
    let (_, height) = layout_inline(&style, atlases, style.inline.as_ref()?, width.max(0.01))?;
    Some((height as f64 + style.padding.top + style.padding.bottom) / physical_scale)
}

pub(in crate::renderer::backend::wgpu::buffer) fn inline_text_geometry(
    bounds: WgpuPhysicalRect,
    style: &WgpuNativeRenderTextStyle,
    opacity: f32,
    atlases: &FontBackendAtlasLayoutMap,
) -> Option<
    Vec<(
        WgpuNativeRenderBufferGeometry,
        ResourceId,
        WgpuNativeRenderPaint,
    )>,
> {
    let inline = style.inline.as_ref()?;
    let clip = FloatRect::from_physical(bounds)?.inset_edges(style.padding)?;
    let (positioned, height) = layout_inline(style, atlases, inline, clip.width)?;
    let top = clip.y
        + match style.vertical_align {
            WgpuNativeRenderVerticalAlign::Top => 0.0,
            WgpuNativeRenderVerticalAlign::Middle => (clip.height - height).max(0.0) * 0.5,
            WgpuNativeRenderVerticalAlign::Bottom => (clip.height - height).max(0.0),
        };
    // CSS dialogue text uses overflow: visible: ink may escape a tight or zero
    // line box. Actual ancestor/stage clipping remains on the draw's scissor.
    let mut output = Vec::new();
    for positioned in positioned {
        let item = positioned.item;
        if item.run.visible_bytes == 0 {
            continue;
        }
        let paint_color = parse_color_literal(&item.run.style.color)?;
        let mut color = paint_color.to_gpu_rgba();
        color[3] *= opacity.clamp(0.0, 1.0);
        let scale = item.style.font_size as f32 / item.atlas.raster_size.max(1.0);
        let (line_height, baseline) = line_metrics(&item.style, item.atlas);
        let embolden = ((font_weight_scale(item.style.font_weight.as_ref()) - 1.0)
            * item.style.font_size as f32
            * 0.16)
            .max(0.0);
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut physical_bounds = None;
        let mut source_offset = 0;
        for (line_index, line) in item.lines.iter().enumerate() {
            // Wrapping may consume whitespace. Locate the line in its original
            // run so reveal counts stay UTF-8 offsets, including explicit LF.
            let offset =
                source_offset + item.run.text[source_offset..].find(&line.text).unwrap_or(0);
            source_offset = offset + line.text.len();
            let visible = item
                .run
                .visible_bytes
                .saturating_sub(offset)
                .min(line.text.len());
            let line_width = measure_text(
                &line.text,
                item.atlas,
                scale,
                item.style.letter_spacing as f32,
                &item.style,
            );
            let mut x = clip.x
                + positioned.x
                + match item.style.align {
                    TextAlign::Center => (item.width - line_width).max(0.0) * 0.5,
                    TextAlign::Right => (item.width - line_width).max(0.0),
                    _ => 0.0,
                };
            let y = top + positioned.y + line_index as f32 * line_height + baseline;
            if let Some(shaped) = shape_text(&line.text, item.atlas, &item.style) {
                // Shape full lines even during reveal; expose complete clusters
                // only. Ligatures and RTL glyph positions must not move per tick.
                let ends: std::collections::BTreeSet<_> = shaped
                    .run
                    .glyphs
                    .iter()
                    .map(|g| g.cluster as usize)
                    .chain(std::iter::once(line.text.len()))
                    .collect();
                for (i, glyph) in shaped.run.glyphs.iter().enumerate() {
                    let end = ends
                        .range((glyph.cluster as usize + 1)..)
                        .next()
                        .copied()
                        .unwrap_or(line.text.len());
                    if end <= visible {
                        physical_bounds = append_atlas_glyph(
                            &shaped.glyphs[&glyph.glyph_id],
                            x + glyph.x_offset * scale,
                            y - glyph.y_offset * scale,
                            scale,
                            if shaped.needs_synthetic_bold {
                                embolden
                            } else {
                                0.0
                            },
                            false,
                            None,
                            color,
                            &mut vertices,
                            &mut indices,
                            physical_bounds,
                        );
                    }
                    let cluster_ends = shaped
                        .run
                        .glyphs
                        .get(i + 1)
                        .is_none_or(|next| next.cluster != glyph.cluster);
                    x += glyph.x_advance * scale
                        + if cluster_ends {
                            item.style.letter_spacing as f32
                        } else {
                            0.0
                        };
                }
            } else {
                for (offset, grapheme) in line.text.grapheme_indices(true) {
                    for character in grapheme.chars() {
                        let Some(glyph) = item.atlas.glyphs.get(&character) else {
                            continue;
                        };
                        if offset + grapheme.len() <= visible && !character.is_whitespace() {
                            physical_bounds = append_atlas_glyph(
                                glyph,
                                x,
                                y,
                                scale,
                                embolden,
                                false,
                                None,
                                color,
                                &mut vertices,
                                &mut indices,
                                physical_bounds,
                            );
                        }
                        x += glyph.advance * scale + item.style.letter_spacing as f32;
                    }
                }
            }
        }
        if let Some(physical_bounds) = physical_bounds {
            output.push((
                WgpuNativeRenderBufferGeometry {
                    physical_bounds,
                    vertices,
                    indices,
                },
                item.atlas.resource_id.clone(),
                WgpuNativeRenderPaint::TextPlaceholder {
                    text: item.run.text.clone(),
                    color: paint_color,
                    literal: item.run.style.color.clone(),
                    style: item.style,
                },
            ));
        }
    }
    Some(output)
}

#[cfg(test)]
mod tests;
