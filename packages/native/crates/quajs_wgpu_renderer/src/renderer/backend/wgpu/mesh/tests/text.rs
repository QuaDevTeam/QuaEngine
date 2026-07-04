use super::*;

#[test]
fn text_placeholder_preserves_glyph_inputs() {
    let style = rich_text_style();
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "dialogue:text",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPrimitiveKind::Text {
            text: "Hello".to_string(),
            color: "rgb(10, 20, 30)".to_string(),
            style: style.clone(),
        },
        physical_rect(20, 20, 300, 40),
        vec![ResourceId::from("fonts:Inter")],
    )]));

    assert_eq!(
        plan.passes[0].quads[0].paint,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Hello".to_string(),
            color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
                r: 10.0 / 255.0,
                g: 20.0 / 255.0,
                b: 30.0 / 255.0,
                a: 1.0,
            }),
            literal: "rgb(10, 20, 30)".to_string(),
            style,
        }
    );
    assert_eq!(
        plan.passes[0].quads[0].resource_ids,
        vec![ResourceId::from("fonts:Inter")]
    );
}

#[test]
fn rich_text_placeholder_preserves_draw_kind_and_glyph_inputs() {
    let style = rich_text_style();
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "ui:menu:rich-body",
        DrawBatchPipeline::Text,
        DrawCommandKind::RichText,
        WgpuNativeRenderPrimitiveKind::Text {
            text: "First line\nSecond line".to_string(),
            color: "#f7f3e8".to_string(),
            style: style.clone(),
        },
        physical_rect(24, 32, 360, 96),
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Serif"),
        ],
    )]));

    let rich_text = &plan.passes[0].quads[0];

    assert_eq!(rich_text.draw_kind, DrawCommandKind::RichText);
    assert_eq!(
        rich_text.paint,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "First line\nSecond line".to_string(),
            color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
                r: 247.0 / 255.0,
                g: 243.0 / 255.0,
                b: 232.0 / 255.0,
                a: 1.0,
            }),
            literal: "#f7f3e8".to_string(),
            style,
        }
    );
    assert_eq!(
        rich_text.resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Serif"),
        ]
    );
}
