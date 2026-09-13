use super::super::super::super::primitive::WgpuNativeRenderTextStyle;
use super::super::super::geometry::FloatRect;
use super::super::width::{is_zero_width_text_character, text_character_width_factor};
use super::glyphs::BITMAP_GLYPH_WIDTH;
use crate::render_graph::{FontStyleDrawParam, TextDecorationDrawParam};

pub(super) fn can_use_bitmap_text(text: &str, style: &WgpuNativeRenderTextStyle) -> bool {
    matches!(
        style.font_style,
        FontStyleDrawParam::Normal | FontStyleDrawParam::Italic
    ) && matches!(
        style.text_decoration,
        TextDecorationDrawParam::None
            | TextDecorationDrawParam::Underline
            | TextDecorationDrawParam::LineThrough
    ) && text.chars().any(|character| !character.is_whitespace())
}

pub(super) fn bitmap_words_width(
    words: &[String],
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
    implicit_word_gap: bool,
) -> f32 {
    let words_width = words
        .iter()
        .map(|word| bitmap_word_width(word, pixel, letter_spacing, weight_scale))
        .sum::<f32>();
    let gaps = if implicit_word_gap {
        words.len().saturating_sub(1) as f32 * bitmap_word_gap(pixel, letter_spacing, weight_scale)
    } else {
        0.0
    };
    words_width + gaps
}

pub(super) fn bitmap_word_width(
    word: &str,
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
) -> f32 {
    let visible_count = word
        .chars()
        .filter(|character| !is_zero_width_text_character(*character))
        .count();
    if visible_count == 0 {
        return 0.0;
    }

    let glyph_width = word
        .chars()
        .map(|character| bitmap_glyph_width(character, pixel, weight_scale))
        .sum::<f32>();
    let inner_gaps = visible_count.saturating_sub(1) as f32 * (pixel + letter_spacing);
    glyph_width + inner_gaps
}

pub(super) fn bitmap_line_word_gap(
    pixel: f32,
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

    let base_gap = bitmap_word_gap(pixel, letter_spacing, weight_scale);
    if !should_justify || word_count <= 1 || raw_line_width >= content_width {
        return base_gap;
    }

    base_gap + ((content_width - raw_line_width) / word_count.saturating_sub(1) as f32).max(0.0)
}

pub(super) fn bitmap_glyph_width(character: char, pixel: f32, weight_scale: f32) -> f32 {
    BITMAP_GLYPH_WIDTH as f32 * pixel * weight_scale * text_character_width_factor(character)
}

pub(super) fn bitmap_glyph_advance(
    character: char,
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
) -> f32 {
    let width = bitmap_glyph_width(character, pixel, weight_scale);
    if width <= 0.0 {
        0.0
    } else {
        width + pixel + letter_spacing
    }
}

pub(super) fn bitmap_ellipsis_width(pixel: f32) -> f32 {
    pixel * 5.0
}

pub(super) fn bitmap_ellipsis_rects(
    content_rect: FloatRect,
    y: f32,
    font_size: f32,
    pixel: f32,
) -> Vec<FloatRect> {
    let dot = pixel.min(content_rect.height);
    let gap = pixel;
    let total_width = dot * 3.0 + gap * 2.0;
    if content_rect.width < total_width || dot <= 0.0 {
        return Vec::new();
    }

    let start_x = content_rect.right() - total_width;
    let dot_y = (y + (font_size - dot) * 0.75)
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

fn bitmap_word_gap(pixel: f32, letter_spacing: f32, weight_scale: f32) -> f32 {
    (pixel * 3.0 * weight_scale + letter_spacing).max(pixel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combining_marks_do_not_expand_bitmap_word_width() {
        assert_eq!(
            bitmap_word_width("e\u{0301}", 2.0, 1.0, 1.0),
            bitmap_word_width("e", 2.0, 1.0, 1.0)
        );
        assert_eq!(bitmap_word_width("\u{0301}", 2.0, 1.0, 1.0), 0.0);
    }
}
