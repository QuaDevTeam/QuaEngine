use super::*;

#[test]
fn clips_overflowing_text_placeholder_without_ellipsis_marker() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::NoWrap;
    style.text_overflow = TextOverflowDrawParam::Clip;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:clipped-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "VeryLongUnbrokenLabelï".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 88, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 4);
    assert_eq!(pass.index_count, 6);
    assert_eq!(pass.vertices[2].position[0], 98.0);
}

#[test]
fn emits_ellipsis_marker_for_overflowing_text_placeholder() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::NoWrap;
    style.text_overflow = TextOverflowDrawParam::Ellipsis;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:ellipsis-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "VeryLongUnbrokenLabelï".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 88, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 16);
    assert_eq!(pass.index_count, 24);
    assert!(pass.vertices[2].position[0] < 98.0);
    assert!(pass.vertices[4].position[0] >= pass.vertices[2].position[0]);
    assert!(pass.vertices[8].position[0] > pass.vertices[4].position[0]);
    assert!(pass.vertices[12].position[0] > pass.vertices[8].position[0]);
    assert_eq!(pass.vertices[4].color, [1.0, 1.0, 1.0, 1.0]);
}
