use super::*;

#[test]
fn renders_justify_text_as_bitmap_geometry() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-justify",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI THERE".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(21.0, TextAlign::Justify, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 220, 64),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 12);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert!(pass.draw_calls[0].physical_bounds.width > 40);
}

#[test]
fn renders_nowrap_text_as_bitmap_geometry() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::NoWrap;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-nowrap",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI THERE".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 220, 64),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 12);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert!(pass.draw_calls[0].physical_bounds.width > 40);
}
