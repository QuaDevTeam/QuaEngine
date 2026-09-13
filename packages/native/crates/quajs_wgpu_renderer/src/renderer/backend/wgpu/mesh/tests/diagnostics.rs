use super::*;
use crate::renderer::backend::NativeBackendEncoderSkipReason;

#[test]
fn tracks_skipped_and_invalid_paint_quads() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![
        primitive(
            "ui:text",
            DrawBatchPipeline::Text,
            DrawCommandKind::Text,
            WgpuNativeRenderPrimitiveKind::Text {
                text: "Invalid".to_string(),
                color: "rgb(300,0,0)".to_string(),
                style: text_style(18.0, TextAlign::Left, EdgeInsetsDrawParam::default()),
            rotation_degrees: 0.0,
            },
            physical_rect(40, 20, 120, 28),
            Vec::new(),
        ),
        primitive(
            "background:missing",
            DrawBatchPipeline::Image,
            DrawCommandKind::Image,
            WgpuNativeRenderPrimitiveKind::Skipped {
                reason: NativeBackendEncoderSkipReason::MissingResources,
                missing_resource_ids: vec![ResourceId::from("images:missing.png")],
            },
            WgpuPhysicalRect::default(),
            vec![ResourceId::from("images:missing.png")],
        ),
    ]));

    assert_eq!(plan.quad_count, 2);
    assert_eq!(plan.visible_quad_count, 0);
    assert_eq!(plan.skipped_quad_count, 1);
    assert_eq!(plan.invalid_paint_count, 1);

    assert_eq!(
        plan.passes[0].quads[0].paint,
        WgpuNativeRenderPaint::InvalidColor {
            literal: "rgb(300,0,0)".to_string(),
        }
    );
    assert!(!plan.passes[0].quads[0].is_visible());
    assert!(matches!(
        &plan.passes[0].quads[1].paint,
        WgpuNativeRenderPaint::Skipped {
            reason: NativeBackendEncoderSkipReason::MissingResources,
            missing_resource_ids,
        } if missing_resource_ids == &vec![ResourceId::from("images:missing.png")]
    ));
}
