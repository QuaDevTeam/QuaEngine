use super::super::width::text_character_width_factor;
use crate::render_graph::{FontStyleDrawParam, FontWeightDrawParam, TextAlign};

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn max_visible_lines(
    content_height: f32,
    text_height: f32,
    line_height: f32,
) -> usize {
    if content_height < text_height {
        return 0;
    }
    1 + ((content_height - text_height) / line_height).floor() as usize
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn placeholder_words_width(
    words: &[String],
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
    implicit_word_gap: bool,
) -> f32 {
    let words_width = words
        .iter()
        .map(|word| placeholder_word_width(word, font_size, letter_spacing, weight_scale))
        .sum::<f32>();
    let gaps = if implicit_word_gap {
        words.len().saturating_sub(1) as f32
            * placeholder_word_gap(font_size, letter_spacing, weight_scale)
    } else {
        0.0
    };
    words_width + gaps
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn placeholder_word_width(
    word: &str,
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
) -> f32 {
    let character_count = word.chars().count();
    let text_units = word
        .chars()
        .map(text_character_width_factor)
        .sum::<f32>()
        .max(1.0);
    let spacing = character_count.saturating_sub(1) as f32 * letter_spacing;
    ((text_units * font_size * 0.52 + spacing) * weight_scale)
        .max(font_size * 0.75 * weight_scale)
        .max(1.0)
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn should_justify_placeholder_line(
    align: TextAlign,
    word_count: usize,
    line_overflows: bool,
    line_index: usize,
    max_lines: usize,
) -> bool {
    matches!(align, TextAlign::Justify)
        && word_count > 1
        && !line_overflows
        && line_index + 1 < max_lines
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn placeholder_line_word_gap(
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
    raw_line_width: f32,
    content_width: f32,
    word_count: usize,
    should_justify: bool,
    implicit_word_gap: bool,
) -> f32 {
    if !implicit_word_gap {
        return 0.0;
    }

    let base_gap = placeholder_word_gap(font_size, letter_spacing, weight_scale);
    if !should_justify || word_count <= 1 || raw_line_width >= content_width {
        return base_gap;
    }

    base_gap + ((content_width - raw_line_width) / word_count.saturating_sub(1) as f32).max(0.0)
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn font_weight_scale(
    weight: Option<&FontWeightDrawParam>,
) -> f32 {
    match weight {
        Some(FontWeightDrawParam::Number(value)) if *value >= 800 => 1.18,
        Some(FontWeightDrawParam::Number(value)) if *value >= 700 => 1.14,
        Some(FontWeightDrawParam::Number(value)) if *value >= 600 => 1.10,
        Some(FontWeightDrawParam::Number(value)) if *value >= 500 => 1.05,
        Some(FontWeightDrawParam::Number(value)) if *value <= 300 => 0.94,
        Some(FontWeightDrawParam::Keyword(keyword))
            if keyword.eq_ignore_ascii_case("bold") || keyword.eq_ignore_ascii_case("bolder") =>
        {
            1.14
        }
        Some(FontWeightDrawParam::Keyword(keyword)) if keyword.eq_ignore_ascii_case("lighter") => {
            0.94
        }
        _ => 1.0,
    }
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn font_style_shear(
    style: FontStyleDrawParam,
    font_size: f32,
) -> f32 {
    match style {
        FontStyleDrawParam::Normal => 0.0,
        FontStyleDrawParam::Italic => (font_size * 0.12).max(1.0),
    }
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn placeholder_ellipsis_width(
    font_size: f32,
) -> f32 {
    let dot = placeholder_ellipsis_dot_size(font_size);
    dot * 3.0 + placeholder_ellipsis_dot_gap(font_size) * 2.0
}

pub(super) fn placeholder_ellipsis_dot_size(font_size: f32) -> f32 {
    (font_size * 0.16).max(2.0)
}

pub(super) fn placeholder_ellipsis_dot_gap(font_size: f32) -> f32 {
    (font_size * 0.08).max(1.0)
}

fn placeholder_word_gap(font_size: f32, letter_spacing: f32, weight_scale: f32) -> f32 {
    (font_size * 0.35 * weight_scale + letter_spacing).max(1.0)
}
