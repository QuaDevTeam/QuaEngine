use super::*;

#[test]
fn renders_italic_ascii_text_as_bitmap_shear_geometry() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.font_style = FontStyleDrawParam::Italic;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:italic-bitmap",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Italic".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 200, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 4);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);

    let min_y = pass
        .vertices
        .iter()
        .map(|vertex| vertex.position[1])
        .fold(f32::INFINITY, f32::min);
    let max_y = pass
        .vertices
        .iter()
        .map(|vertex| vertex.position[1])
        .fold(f32::NEG_INFINITY, f32::max);
    let top_min_x = min_x_at_y(&pass.vertices, min_y);
    let bottom_min_x = min_x_at_y(&pass.vertices, max_y);
    assert!(top_min_x > bottom_min_x);
}
