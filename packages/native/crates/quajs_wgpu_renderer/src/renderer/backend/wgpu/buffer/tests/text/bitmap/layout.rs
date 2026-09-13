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

#[test]
fn wraps_oversized_fullwidth_bitmap_words_by_glyph_width() {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.line_height = 30.0;
    style.white_space = WhiteSpaceDrawParam::Normal;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-cjk-wrap",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "開始開始開始".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 70, 120),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    let mut glyph_top_lines = pass
        .vertices
        .chunks_exact(4)
        .map(|glyph| glyph[0].position[1])
        .collect::<Vec<_>>();
    glyph_top_lines.sort_by(f32::total_cmp);
    glyph_top_lines.dedup_by(|left, right| (*left - *right).abs() < 0.01);

    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 24);
    assert_eq!(pass.index_count, pass.vertex_count / 4 * 6);
    assert!(glyph_top_lines.len() >= 3);
    assert!(pass.draw_calls[0].physical_bounds.height > 70);
}

#[test]
fn supports_top_aligned_text_without_changing_button_middle_alignment() {
    let mut top_style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    top_style.vertical_align = WgpuNativeRenderVerticalAlign::Top;
    let middle_style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![
        quad(
            "dialogue:text",
            DrawBatchPipeline::Text,
            DrawCommandKind::Text,
            WgpuNativeRenderPaint::TextPlaceholder {
                text: "TOP".to_string(),
                color: rgba(0xff, 0xff, 0xff, 0xff),
                literal: "#fff".to_string(),
                style: top_style,
            },
            rect(10, 20, 220, 80),
            Vec::new(),
        ),
        quad(
            "ui:button-label",
            DrawBatchPipeline::Text,
            DrawCommandKind::Text,
            WgpuNativeRenderPaint::TextPlaceholder {
                text: "MIDDLE".to_string(),
                color: rgba(0xff, 0xff, 0xff, 0xff),
                literal: "#fff".to_string(),
                style: middle_style,
            },
            rect(250, 20, 220, 80),
            Vec::new(),
        ),
    ]));

    let top = &plan.passes[0].draw_calls[0].physical_bounds;
    let middle = &plan.passes[0].draw_calls[1].physical_bounds;
    assert_eq!(top.y, 20);
    assert!(middle.y > top.y);
}
