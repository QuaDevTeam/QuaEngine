mod layout;
mod line;
mod metrics;
mod transform;

pub(super) use layout::{aligned_line_x, ellipsis_marker_rects, text_decoration_rect};
pub(super) use line::placeholder_lines;
pub(super) use metrics::{
    font_style_shear, font_weight_scale, max_visible_lines, placeholder_ellipsis_width,
    placeholder_line_word_gap, placeholder_word_width, placeholder_words_width,
    should_justify_placeholder_line,
};
