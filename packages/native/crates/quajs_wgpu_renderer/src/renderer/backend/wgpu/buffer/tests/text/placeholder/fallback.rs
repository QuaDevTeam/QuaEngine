use super::*;

#[test]
fn applies_font_weight_to_text_placeholder_stroke_and_width() {
    let regular = text_placeholder_bounds_with_style({
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.font_weight = Some(FontWeightDrawParam::Number(400));
        style
    });
    let bold = text_placeholder_bounds_with_style({
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.font_weight = Some(FontWeightDrawParam::Keyword("bold".to_string()));
        style
    });

    assert_eq!(regular.x, bold.x);
    assert!(bold.width > regular.width);
    assert!(bold.height >= regular.height);
}

#[test]
fn applies_italic_font_style_as_text_placeholder_shear_for_unsupported_glyphs() {
    let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.font_style = FontStyleDrawParam::Italic;
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:italic-label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Tïlt".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 200, 48),
        Vec::new(),
    )]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertex_count, 4);
    assert_eq!(pass.index_count, 6);
    assert!(pass.vertices[0].position[0] > pass.vertices[3].position[0]);
    assert!(pass.vertices[1].position[0] > pass.vertices[2].position[0]);
    assert!(pass.draw_calls[0].physical_bounds.width > 41);
}

#[test]
fn capitalizes_text_placeholder_after_punctuation_boundaries() {
    let unchanged = text_placeholder_bounds_for_text_with_style("ß-a", {
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.text_transform = TextTransformDrawParam::None;
        style
    });
    let capitalized = text_placeholder_bounds_for_text_with_style("ß-a", {
        let mut style = text_style(20.0, TextAlign::Left, EdgeInsetsDrawParam::default());
        style.text_transform = TextTransformDrawParam::Capitalize;
        style
    });

    assert_eq!(capitalized.x, unchanged.x);
    assert!(capitalized.width > unchanged.width);
}

#[test]
fn reports_text_placeholder_without_generated_geometry_as_skipped() {
    let style = text_style(
        20.0,
        TextAlign::Left,
        EdgeInsetsDrawParam {
            top: 0.0,
            right: 120.0,
            bottom: 0.0,
            left: 120.0,
        },
    );
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:collapsed-text",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Hidden".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 200, 40),
        Vec::new(),
    )]));

    assert_eq!(plan.vertex_count, 0);
    assert_eq!(plan.index_count, 0);
    assert_eq!(plan.draw_call_count, 0);
    assert_eq!(plan.skipped_quad_count, 1);
    assert_eq!(
        plan.passes[0].skipped_quads[0].command_id,
        "ui:collapsed-text"
    );
    assert_eq!(
        plan.passes[0].skipped_quads[0].reason,
        WgpuNativeRenderSkippedQuadReason::NonDrawablePaint
    );
}
