use super::*;

#[test]
fn clips_overflowing_bitmap_text_without_ellipsis_marker() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::NoWrap;
    style.text_overflow = TextOverflowDrawParam::Clip;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-clip",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI THERE AGAIN".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 88, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 4);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert_eq!(pass.draw_calls[0].physical_bounds.x, 10);
    assert_eq!(
        pass.draw_calls[0].physical_bounds.x + pass.draw_calls[0].physical_bounds.width,
        98
    );
    assert!(pass
        .vertices
        .iter()
        .all(|vertex| vertex.position[0] <= 98.0));
}

#[test]
fn emits_ellipsis_marker_for_overflowing_bitmap_text() {
    let clip = bitmap_text_overflow_pass(TextOverflowDrawParam::Clip);
    let ellipsis = bitmap_text_overflow_pass(TextOverflowDrawParam::Ellipsis);

    assert_eq!(clip.draw_call_count, 1);
    assert_eq!(ellipsis.draw_call_count, 1);
    assert!(ellipsis.vertex_count >= 12);
    assert_eq!(ellipsis.vertex_count % 4, 0);
    assert_eq!(ellipsis.index_count, ellipsis.vertex_count / 4 * 6);
    assert!(ellipsis
        .vertices
        .iter()
        .all(|vertex| vertex.position[0] <= 98.0));

    let marker_start = ellipsis.vertex_count - 12;
    assert!(marker_start <= clip.vertex_count);
    let marker = &ellipsis.vertices[marker_start..];
    let marker_min_x = marker
        .iter()
        .map(|vertex| vertex.position[0])
        .fold(f32::INFINITY, f32::min);
    let clipped_text_max_x = ellipsis.vertices[..marker_start]
        .iter()
        .map(|vertex| vertex.position[0])
        .fold(f32::NEG_INFINITY, f32::max);
    assert!(marker_min_x >= clipped_text_max_x);
    assert_eq!(marker[0].color, [1.0, 1.0, 1.0, 1.0]);
}
