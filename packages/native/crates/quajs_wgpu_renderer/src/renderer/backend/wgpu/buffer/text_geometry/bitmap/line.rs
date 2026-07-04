use super::super::placeholder::transform::{
    normalized_source_lines, placeholder_words, preserved_placeholder_segments,
    transform_placeholder_text,
};
use super::metrics::bitmap_words_width;
use crate::render_graph::WhiteSpaceDrawParam;
use crate::renderer::backend::wgpu::primitive::WgpuNativeRenderTextStyle;

#[derive(Clone, Debug, PartialEq)]
pub(super) struct BitmapLine {
    pub words: Vec<String>,
    pub implicit_word_gap: bool,
}

pub(super) fn bitmap_lines(
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    content_width: f32,
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
) -> Vec<BitmapLine> {
    let transformed = transform_placeholder_text(text, style.text_transform);
    let source_lines = normalized_source_lines(&transformed, style.white_space);
    let preserve_whitespace = matches!(
        style.white_space,
        WhiteSpaceDrawParam::Pre | WhiteSpaceDrawParam::PreWrap
    );
    let should_wrap = matches!(
        style.white_space,
        WhiteSpaceDrawParam::Normal | WhiteSpaceDrawParam::PreLine | WhiteSpaceDrawParam::PreWrap
    );

    let mut lines = Vec::new();
    for source_line in source_lines {
        let words = if preserve_whitespace {
            preserved_placeholder_segments(&source_line)
        } else {
            placeholder_words(&source_line)
        };
        if words.is_empty() {
            continue;
        }
        if should_wrap {
            lines.extend(wrap_bitmap_words(
                words,
                content_width,
                pixel,
                letter_spacing,
                weight_scale,
                !preserve_whitespace,
            ));
        } else {
            lines.push(BitmapLine {
                words,
                implicit_word_gap: !preserve_whitespace,
            });
        }
    }
    lines
}

fn wrap_bitmap_words(
    words: Vec<String>,
    content_width: f32,
    pixel: f32,
    letter_spacing: f32,
    weight_scale: f32,
    implicit_word_gap: bool,
) -> Vec<BitmapLine> {
    let mut lines = Vec::new();
    let mut current = Vec::new();

    for word in words {
        let mut candidate = current.clone();
        candidate.push(word.clone());
        if !current.is_empty()
            && bitmap_words_width(
                &candidate,
                pixel,
                letter_spacing,
                weight_scale,
                implicit_word_gap,
            ) > content_width
        {
            lines.push(BitmapLine {
                words: current,
                implicit_word_gap,
            });
            current = vec![word];
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        lines.push(BitmapLine {
            words: current,
            implicit_word_gap,
        });
    }
    lines
}
