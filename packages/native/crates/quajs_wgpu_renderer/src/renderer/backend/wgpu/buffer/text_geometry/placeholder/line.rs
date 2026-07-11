use super::metrics::placeholder_words_width;
use super::transform::{
    normalized_source_lines, placeholder_words, preserved_placeholder_segments,
    transform_placeholder_text,
};
use crate::render_graph::WhiteSpaceDrawParam;
use crate::renderer::backend::wgpu::primitive::WgpuNativeRenderTextStyle;

#[derive(Clone, Debug, PartialEq)]
pub(in crate::renderer::backend::wgpu::buffer::text_geometry) struct PlaceholderLine {
    pub words: Vec<String>,
    pub implicit_word_gap: bool,
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn placeholder_lines(
    text: &str,
    style: &WgpuNativeRenderTextStyle,
    content_width: f32,
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
) -> Vec<PlaceholderLine> {
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
            lines.extend(wrap_placeholder_words(
                words,
                content_width,
                font_size,
                letter_spacing,
                weight_scale,
                !preserve_whitespace,
            ));
        } else {
            lines.push(PlaceholderLine {
                words,
                implicit_word_gap: !preserve_whitespace,
            });
        }
    }
    lines
}

fn wrap_placeholder_words(
    words: Vec<String>,
    content_width: f32,
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
    implicit_word_gap: bool,
) -> Vec<PlaceholderLine> {
    let mut lines = Vec::new();
    let mut current = Vec::new();

    for word in words {
        if placeholder_words_width(
            std::slice::from_ref(&word),
            font_size,
            letter_spacing,
            weight_scale,
            false,
        ) > content_width
        {
            if !current.is_empty() {
                lines.push(PlaceholderLine {
                    words: current,
                    implicit_word_gap,
                });
                current = Vec::new();
            }
            lines.extend(split_oversized_placeholder_word(
                &word,
                content_width,
                font_size,
                letter_spacing,
                weight_scale,
                implicit_word_gap,
            ));
            continue;
        }

        let mut candidate = current.clone();
        candidate.push(word.clone());
        if !current.is_empty()
            && placeholder_words_width(
                &candidate,
                font_size,
                letter_spacing,
                weight_scale,
                implicit_word_gap,
            ) > content_width
        {
            lines.push(PlaceholderLine {
                words: current,
                implicit_word_gap,
            });
            current = vec![word];
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        lines.push(PlaceholderLine {
            words: current,
            implicit_word_gap,
        });
    }
    lines
}

fn split_oversized_placeholder_word(
    word: &str,
    content_width: f32,
    font_size: f32,
    letter_spacing: f32,
    weight_scale: f32,
    implicit_word_gap: bool,
) -> Vec<PlaceholderLine> {
    let mut lines = Vec::new();
    let mut current = String::new();

    for character in word.chars() {
        let mut candidate = current.clone();
        candidate.push(character);
        if !current.is_empty()
            && placeholder_words_width(
                std::slice::from_ref(&candidate),
                font_size,
                letter_spacing,
                weight_scale,
                false,
            ) > content_width
        {
            lines.push(PlaceholderLine {
                words: vec![current],
                implicit_word_gap,
            });
            current = character.to_string();
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        lines.push(PlaceholderLine {
            words: vec![current],
            implicit_word_gap,
        });
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_graph::{
        EdgeInsetsDrawParam, FontStyleDrawParam, TextAlign, TextDecorationDrawParam,
        TextOverflowDrawParam, TextTransformDrawParam, WhiteSpaceDrawParam,
    };
    use crate::renderer::backend::wgpu::primitive::{
        WgpuNativeRenderTextStyle, WgpuNativeRenderVerticalAlign,
    };

    fn text_style(font_size: f64) -> WgpuNativeRenderTextStyle {
        WgpuNativeRenderTextStyle {
            font_family: vec!["Inter".to_string()],
            font_size,
            font_style: FontStyleDrawParam::Normal,
            font_weight: None,
            letter_spacing: 0.0,
            line_height: font_size + 8.0,
            align: TextAlign::Left,
            vertical_align: WgpuNativeRenderVerticalAlign::Middle,
            text_decoration: TextDecorationDrawParam::None,
            text_overflow: TextOverflowDrawParam::Clip,
            text_transform: TextTransformDrawParam::None,
            white_space: WhiteSpaceDrawParam::Normal,
            padding: EdgeInsetsDrawParam::default(),
        }
    }

    #[test]
    fn wraps_oversized_fullwidth_placeholder_words_by_character_width() {
        let style = text_style(20.0);
        let lines = placeholder_lines("開始設定画面保存読込", &style, 72.0, 20.0, 0.0, 1.0);

        assert!(lines.len() > 1);
        assert!(lines.iter().all(|line| line.words.len() == 1));
        assert!(lines.iter().any(|line| line.words[0].chars().count() <= 3));
        assert_eq!(
            lines
                .into_iter()
                .flat_map(|line| line.words)
                .collect::<Vec<_>>(),
            vec![
                "開始設".to_string(),
                "定画面".to_string(),
                "保存読".to_string(),
                "込".to_string()
            ]
        );
    }
}
