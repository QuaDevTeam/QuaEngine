use crate::projection::typography::font_weight_to_draw_param;
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

pub fn resolve_font_size(style: &RichTextStyle, fallback: f64) -> f64 {
    style
        .font_size
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(fallback)
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
