use super::*;

#[test]
fn preserves_pre_whitespace_for_placeholder_fallback_geometry() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.font_style = FontStyleDrawParam::Italic;
    style.white_space = WhiteSpaceDrawParam::Pre;

    let compact = text_placeholder_bounds_for_text_with_style("A ï", style.clone());
    let spaced = text_placeholder_bounds_for_text_with_style("A   ï", style);

    assert!(spaced.width > compact.width + 12);
}

#[test]
fn wraps_normal_text_placeholder_words_across_lines() {
    let mut style = text_style(18.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.line_height = 28.0;
    style.white_space = WhiteSpaceDrawParam::Normal;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:body",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Alpha Beta Gamma Delta".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 120, 120),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 8);
    assert!(pass.index_count > 12);
    assert!(pass.draw_calls[0].physical_bounds.height > 28);
    assert!(pass
        .vertices
        .iter()
        .any(|vertex| vertex.position[1] > pass.vertices[0].position[1] + 20.0));
}

#[test]
fn justifies_bitmap_fallback_word_gaps_on_non_final_wrapped_lines() {
    let left = text_placeholder_pass_with_style({
        let mut style = text_style(18.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.line_height = 28.0;
        style.white_space = WhiteSpaceDrawParam::Normal;
        style
    });
    let justified = text_placeholder_pass_with_style({
        let mut style = text_style(18.0, TextAlign::Justify, EdgeInsetsDrawParam::default());
        style.line_height = 28.0;
        style.white_space = WhiteSpaceDrawParam::Normal;
        style
    });

    let left_first_gap = left.vertices[12].position[0] - left.vertices[9].position[0];
    let justified_first_gap =
        justified.vertices[12].position[0] - justified.vertices[9].position[0];

    assert_eq!(left.draw_call_count, 1);
    assert_eq!(justified.draw_call_count, 1);
    assert_eq!(left.vertex_count, justified.vertex_count);
    assert!(justified_first_gap > left_first_gap);
    assert_eq!(justified.draw_calls[0].physical_bounds.x, 10);
    assert_eq!(
        justified.draw_calls[0].physical_bounds.x + justified.draw_calls[0].physical_bounds.width,
        130
    );
}

#[test]
fn applies_letter_spacing_to_text_placeholder_word_width() {
    let compact = text_placeholder_bounds_with_style({
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.letter_spacing = 0.0;
        style
    });
    let spaced = text_placeholder_bounds_with_style({
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.letter_spacing = 4.0;
        style
    });

    assert!(spaced.width > compact.width);
    assert_eq!(spaced.x, compact.x);
}
