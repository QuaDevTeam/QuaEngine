use super::*;

#[test]
fn emits_standalone_text_placeholder_as_centered_word_placeholders() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:title",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Chapter § Start".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(24.0, TextAlign::Center, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 240, 64),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert!(pass.vertex_count > 8);
    assert_eq!(pass.vertex_count % 4, 0);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert_eq!(pass.draw_call_count, 1);

    let text = &pass.draw_calls[0];
    assert_eq!(text.command_id, "ui:title");
    assert_eq!(text.pipeline, DrawBatchPipeline::Text);
    assert_eq!(text.draw_kind, DrawCommandKind::Text);
    assert!(text.physical_bounds.width < 240);
    assert!(text.physical_bounds.height < 64);
    assert!(text.physical_bounds.x > 10);
    assert!(text.physical_bounds.y > 20);
    assert!(pass.vertices[0].position[0] > 10.0);
    assert!(pass.vertices[0].position[1] > 20.0);
    assert!(pass.vertices[2].position[0] < 250.0);
    assert!(pass.vertices[2].position[1] < 84.0);
    assert_eq!(pass.vertices[0].color, [1.0, 1.0, 1.0, 1.0]);
    assert!(pass
        .vertices
        .iter()
        .skip(4)
        .any(|vertex| vertex.position[0] > pass.vertices[2].position[0]));
    assert!(matches!(
        &text.paint,
        WgpuNativeRenderPaint::TextPlaceholder { text, style, .. }
            if text == "Chapter § Start" && style.font_size == 24.0
    ));
}

#[test]
fn applies_text_placeholder_alignment_inside_padding() {
    let padding = EdgeInsetsDrawParam {
        top: 4.0,
        right: 10.0,
        bottom: 6.0,
        left: 20.0,
    };
    let left = text_placeholder_bounds(TextAlign::Left, padding);
    let center = text_placeholder_bounds(TextAlign::Center, padding);
    let right = text_placeholder_bounds(TextAlign::Right, padding);

    assert_eq!(left.x, 30);
    assert!(center.x > left.x);
    assert!(right.x > center.x);
    assert_eq!(right.x + right.width, 200);
    assert_eq!(left.y, center.y);
    assert_eq!(center.y, right.y);
    assert!(left.y > 20);
    assert!(left.height < 40);
}
