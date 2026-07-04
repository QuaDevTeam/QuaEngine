use super::*;

#[test]
fn preserves_pre_whitespace_for_bitmap_text_geometry() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::Pre;

    let compact = text_placeholder_bounds_for_text_with_style("A B", style.clone());
    let spaced = text_placeholder_bounds_for_text_with_style("A   B", style);

    assert!(spaced.width > compact.width + 20);
}

#[test]
fn collapses_normal_whitespace_for_bitmap_text_geometry() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::Normal;

    let compact = text_placeholder_bounds_for_text_with_style("A B", style.clone());
    let spaced = text_placeholder_bounds_for_text_with_style("A   B", style);

    assert_eq!(spaced.width, compact.width);
}
