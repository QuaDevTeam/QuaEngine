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

#[test]
fn renders_pre_line_bitmap_text_as_collapsed_explicit_lines() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.line_height = 30.0;
    style.white_space = WhiteSpaceDrawParam::PreLine;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-pre-line",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "A   B\nC".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 160, 96),
        Vec::new(),
    )]));
    let pass = &plan.passes[0];
    let first_line_y = pass.vertices[0].position[1];

    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 12);
    assert_eq!(pass.index_count, 18);
    assert!(pass.draw_calls[0].physical_bounds.height > 40);
    assert!(pass
        .vertices
        .iter()
        .any(|vertex| vertex.position[1] > first_line_y + 24.0));
}
