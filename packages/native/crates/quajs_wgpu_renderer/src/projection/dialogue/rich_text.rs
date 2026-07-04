use crate::projection::safety::{is_safe_native_text_payload, is_safe_native_text_payload_bytes};
use crate::projection::typography::{font_family_to_draw_param, font_weight_to_draw_param};
use crate::render_graph::{FontWeightDrawParam, TextAlign};

use super::types::{RichTextContent, RichTextStyle};

pub fn rich_text_to_plain_text(content: &RichTextContent) -> String {
    match content {
        RichTextContent::Plain(text) => text.clone(),
        RichTextContent::Document(document) => document
            .blocks
            .iter()
            .map(|block| {
                block
                    .spans
                    .iter()
                    .map(|span| span.text.as_str())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

pub fn is_safe_rich_text_payload(content: &RichTextContent) -> bool {
    match content {
        RichTextContent::Plain(text) => is_safe_native_text_payload(text),
        RichTextContent::Document(document) => {
            let mut total_bytes = 0usize;
            for (block_index, block) in document.blocks.iter().enumerate() {
                if block_index > 0 {
                    total_bytes = total_bytes.saturating_add(1);
                }
                for span in &block.spans {
                    if !is_safe_native_text_payload(&span.text) {
                        return false;
                    }
                    total_bytes = total_bytes.saturating_add(span.text.len());
                }
            }
            is_safe_native_text_payload_bytes(total_bytes)
        }
    }
}

pub fn rich_text_style(content: &RichTextContent) -> Option<&RichTextStyle> {
    match content {
        RichTextContent::Document(document) => Some(&document.style),
        RichTextContent::Plain(_) => None,
    }
}

pub fn resolve_text_align(style: &RichTextStyle) -> TextAlign {
    match style
        .text_align
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("center") => TextAlign::Center,
        Some("right") => TextAlign::Right,
        Some("justify") => TextAlign::Justify,
        _ => TextAlign::Left,
    }
}

pub fn resolve_text_color(style: &RichTextStyle, fallback: &str) -> String {
    style
        .color
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub fn resolve_font_size(style: &RichTextStyle, fallback: f64) -> f64 {
    style
        .font_size
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(fallback)
}

pub fn resolve_font_family(style: &RichTextStyle) -> Vec<String> {
    font_family_to_draw_param(&style.font_family)
}

pub fn resolve_font_weight(style: &RichTextStyle) -> Option<FontWeightDrawParam> {
    font_weight_to_draw_param(&style.font_weight)
}

pub fn resolve_line_height(style: &RichTextStyle, fallback: f64) -> f64 {
    style
        .line_height
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(fallback)
}
