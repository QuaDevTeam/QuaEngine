use super::*;

#[test]
fn renders_supported_ascii_text_as_bitmap_glyph_geometry() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
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

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 8);
    assert_eq!(pass.vertex_count % 4, 0);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert_eq!(
        pass.vertices[0].color,
        [32.0 / 255.0, 192.0 / 255.0, 1.0, 1.0]
    );
    assert!(pass.vertices.iter().any(|vertex| vertex.position[1] > 35.0));
    assert!(pass.vertices.iter().any(|vertex| vertex.uv[0] > 0.0));
    assert!(pass.vertices.iter().any(|vertex| vertex.uv[1] > 0.0));
}

#[test]
fn renders_common_ascii_ui_symbols_as_bitmap_glyph_geometry() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-symbols",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "SET {A} $9 ~^`".to_string(),
            color: rgba(0xff, 0xf0, 0x80, 0xff),
            literal: "#fff080".to_string(),
            style: text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 260, 56),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert!(pass.vertex_count > 40);
    assert_eq!(pass.vertex_count % 4, 0);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert_eq!(
        pass.vertices[0].color,
        [1.0, 240.0 / 255.0, 128.0 / 255.0, 1.0]
    );
}
