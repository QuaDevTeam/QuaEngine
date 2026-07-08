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

#[test]
fn renders_mixed_unsupported_glyphs_with_bitmap_fallback_geometry() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-mixed-glyphs",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "開始 A!".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 220, 56),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 16);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert!(pass.vertices.iter().any(|vertex| vertex.uv[0] > 0.0));
    assert!(pass.vertices.iter().any(|vertex| vertex.uv[1] > 0.0));
}

#[test]
fn does_not_render_combining_marks_as_bitmap_fallback_blocks() {
    let plain_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-plain-accent-base",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "e".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 220, 56),
        Vec::new(),
    )]));
    let combined_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-combining-accent",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "e\u{0301}".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
        },
        rect(10, 20, 220, 56),
        Vec::new(),
    )]));

    let plain_pass = &plain_plan.passes[0];
    let combined_pass = &combined_plan.passes[0];
    assert_eq!(combined_pass.vertex_count, plain_pass.vertex_count);
    assert_eq!(
        combined_pass.draw_calls[0].physical_bounds.width,
        plain_pass.draw_calls[0].physical_bounds.width
    );
}

#[test]
fn reserves_fullwidth_cells_for_cjk_bitmap_fallback_glyphs() {
    let style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    let ascii_bounds = text_placeholder_bounds_for_text_with_style("AA", style.clone());
    let cjk_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-cjk-fallback",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "開始".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 260, 80),
        Vec::new(),
    )]));

    let pass = &cjk_plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 8);
    assert!(pass.draw_calls[0].physical_bounds.width > ascii_bounds.width + 20);
}
