use super::*;

#[test]
fn renders_bitmap_text_decoration_as_bitmap_geometry() {
    let plain_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI".to_string(),
            color: rgba(0x20, 0xc0, 0xff, 0xff),
            literal: "#20c0ff".to_string(),
            style: text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 160, 48),
        Vec::new(),
    )]));
    let plain_pass = &plain_plan.passes[0];

    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.text_decoration = TextDecorationDrawParam::Underline;
    let decorated_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI".to_string(),
            color: rgba(0x20, 0xc0, 0xff, 0xff),
            literal: "#20c0ff".to_string(),
            style,
        },
        rect(10, 20, 160, 48),
        Vec::new(),
    )]));

    let decorated_pass = &decorated_plan.passes[0];
    assert_eq!(decorated_pass.draw_call_count, 1);
    assert_eq!(decorated_pass.vertex_count, plain_pass.vertex_count + 4);
    assert_eq!(decorated_pass.index_count, plain_pass.index_count + 6);
    assert_eq!(
        decorated_pass.vertices.last().unwrap().color,
        [32.0 / 255.0, 192.0 / 255.0, 1.0, 1.0]
    );
}
