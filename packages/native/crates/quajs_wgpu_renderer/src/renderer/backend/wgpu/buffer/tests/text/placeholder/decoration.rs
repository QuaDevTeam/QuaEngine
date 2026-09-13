use super::*;

#[test]
fn emits_underline_decoration_for_bitmap_fallback_geometry() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.text_decoration = TextDecorationDrawParam::Underline;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:underlined-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Labelï".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 200, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 28);
    assert_eq!(pass.index_count, 42);
    let decoration_start = pass.vertex_count - 4;
    assert!(pass.vertices[decoration_start].position[1] > pass.vertices[0].position[1]);
    assert_eq!(pass.vertices[decoration_start].color, [1.0, 1.0, 1.0, 1.0]);
    assert!(pass.draw_calls[0].physical_bounds.height > 4);
}

#[test]
fn emits_line_through_decoration_for_bitmap_fallback_geometry() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.text_decoration = TextDecorationDrawParam::LineThrough;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:struck-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Labelï".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 200, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 28);
    assert_eq!(pass.index_count, 42);
    let decoration_start = pass.vertex_count - 4;
    assert!(pass.vertices[decoration_start].position[1] > pass.vertices[0].position[1]);
    assert!(pass.vertices[decoration_start].position[1] < pass.vertices[2].position[1]);
}
