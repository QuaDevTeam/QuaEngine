use super::builder::{apply_provenance, text_command};
use super::rich_text::*;
use super::types::{RichTextContent, RichTextStyle};
use crate::projection::common::PackageProvenance;
use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    DrawCommand, DrawCommandParams, FontWeightDrawParam, InlineTextBlock, InlineTextDrawParams,
    InlineTextRun, InlineTextStyle, LogicalRect,
};

pub(super) fn inline_text_commands(
    id: &str,
    bounds: LogicalRect,
    content: &RichTextContent,
    layout_content: Option<&RichTextContent>,
    document_style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
    fallback_font_weight: Option<FontWeightDrawParam>,
    shadow: Option<(f64, f64, f64, &str)>,
    provenance: &PackageProvenance,
) -> Vec<DrawCommand> {
    if matches!(content, RichTextContent::Plain(text) if text.is_empty())
        && layout_content.is_none()
    {
        return Vec::new();
    }
    let base = super::typography::defaults(fallback_font_size, fallback_line_height);
    let inherited = rich_text_style(content)
        .map(|style| super::typography::inherit(&base, style))
        .unwrap_or(base);
    // Web applies speakerStyle after the rich document's root typography.
    let inherited = super::typography::inherit(&inherited, document_style);
    let document_style = &inherited;
    let text = rich_text_to_plain_text(content);
    let mut command = text_command(
        id,
        bounds,
        text.clone(),
        document_style,
        role,
        fallback_font_size,
        fallback_line_height,
        fallback_font_weight.clone(),
        0.0,
    )
    .z_index(2);
    // Keep block/span identity and full source through reveal. Font selection,
    // line boxes and glyph positions are resolved only after QPK fonts load.
    let full = layout_content
        .filter(|full| compatible_reveal_source(content, full))
        .unwrap_or(content);
    if let RichTextContent::Document(document) = full {
        let RichTextContent::Document(visible) = content else {
            unreachable!()
        };
        let blocks = document
            .blocks
            .iter()
            .zip(&visible.blocks)
            .map(|(block, shown)| {
                let block_style = super::typography::inherit(document_style, &block.style);
                let style = inline_style(
                    &block_style,
                    role,
                    fallback_font_size,
                    fallback_line_height,
                    fallback_font_weight.clone(),
                );
                command
                    .resource_ids
                    .extend(font_family_resource_ids(&style.font_family));
                let runs = block
                    .spans
                    .iter()
                    .zip(&shown.spans)
                    .map(|(span, shown)| {
                        let style = super::typography::inherit(&block_style, &span.style);
                        let style = inline_style(
                            &style,
                            role,
                            fallback_font_size,
                            fallback_line_height,
                            fallback_font_weight.clone(),
                        );
                        command
                            .resource_ids
                            .extend(font_family_resource_ids(&style.font_family));
                        InlineTextRun {
                            text: span.text.clone(),
                            visible_bytes: shown.text.len(),
                            style,
                        }
                    })
                    .collect();
                InlineTextBlock { style, runs }
            })
            .collect();
        command.resource_ids.sort();
        command.resource_ids.dedup();
        if let DrawCommandParams::Text(params) = &mut command.params {
            params.inline = Some(InlineTextDrawParams { blocks });
        }
    }
    if let (RichTextContent::Plain(source), RichTextContent::Plain(shown)) = (full, content) {
        let style = inline_style(
            document_style,
            role,
            fallback_font_size,
            fallback_line_height,
            fallback_font_weight.clone(),
        );
        if let DrawCommandParams::Text(params) = &mut command.params {
            params.inline = Some(InlineTextDrawParams {
                blocks: vec![InlineTextBlock {
                    style: style.clone(),
                    runs: vec![InlineTextRun {
                        text: source.clone(),
                        visible_bytes: shown.len(),
                        style,
                    }],
                }],
            });
        }
    }
    let mut commands = Vec::new();
    if let Some((offset_x, offset_y, blur, color)) = shadow {
        let mut shadow = text_shadow_command(
            id,
            bounds,
            text,
            document_style,
            role,
            fallback_font_size,
            fallback_line_height,
            fallback_font_weight,
            offset_x,
            offset_y,
            blur,
            color,
            2,
        );
        shadow.resource_ids = command.resource_ids.clone();
        if let (DrawCommandParams::Text(source), DrawCommandParams::Text(target)) =
            (&command.params, &mut shadow.params)
        {
            target.inline = source.inline.clone();
            if let Some(inline) = &mut target.inline {
                for block in &mut inline.blocks {
                    block.style.color = color.to_string();
                    for run in &mut block.runs {
                        run.style.color = color.to_string();
                    }
                }
            }
        }
        commands.push(apply_provenance(shadow, provenance));
    }
    commands.push(apply_provenance(command, provenance));
    commands
}

fn compatible_reveal_source(visible: &RichTextContent, full: &RichTextContent) -> bool {
    if !is_safe_rich_text_payload(full) {
        return false;
    }
    match (visible, full) {
        (RichTextContent::Document(visible), RichTextContent::Document(full)) => {
            visible.blocks.len() == full.blocks.len()
                && visible.blocks.iter().zip(&full.blocks).all(|(a, b)| {
                    a.spans.len() == b.spans.len()
                        && a.spans
                            .iter()
                            .zip(&b.spans)
                            .all(|(a, b)| b.text.starts_with(&a.text))
                })
        }
        (RichTextContent::Plain(visible), RichTextContent::Plain(full)) => {
            full.starts_with(visible)
        }
        _ => false,
    }
}

fn inline_style(
    style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
    fallback_font_weight: Option<FontWeightDrawParam>,
) -> InlineTextStyle {
    let font_size = resolve_font_size(style, fallback_font_size);
    InlineTextStyle {
        normal_line_height: super::typography::normal_line_height(style),
        align: resolve_text_align(style),
        font_family: resolve_font_family(style),
        font_size,
        line_height: resolve_line_height(style, font_size, fallback_line_height),
        font_weight: resolve_font_weight(style).or(fallback_font_weight),
        color: resolve_text_color(
            style,
            if role == "speaker" {
                "#ffe3a0"
            } else {
                "#fffaf2"
            },
        ),
    }
}

/// Creates a CSS `text-shadow`-style pre-pass command: the text is rendered at
/// (`offset_x`, `offset_y`) in `shadow_color` with `blur_radius` applied.
/// Intended to be pushed *before* the main text command (lower `z_index`).
fn text_shadow_command(
    id: &str,
    bounds: crate::render_graph::LogicalRect,
    text: String,
    style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
    fallback_font_weight: Option<FontWeightDrawParam>,
    offset_x: f64,
    offset_y: f64,
    blur: f64,
    shadow_color: &str,
    z_index: i32,
) -> DrawCommand {
    // Inherit all style properties from the source text but override the colour.
    let shadow_style = RichTextStyle {
        color: Some(shadow_color.to_string()),
        ..style.clone()
    };
    let shadow_bounds = crate::render_graph::LogicalRect {
        x: bounds.x + offset_x,
        y: bounds.y + offset_y,
        width: bounds.width,
        height: bounds.height,
    };
    text_command(
        &format!("{id}:shadow"),
        shadow_bounds,
        text,
        &shadow_style,
        &format!("{role}-shadow"),
        fallback_font_size,
        fallback_line_height,
        fallback_font_weight,
        blur,
    )
    .z_index(z_index - 1)
}
