use super::*;
use crate::renderer::backend::NativeBackendEncoderSkipReason;

#[test]
fn skips_non_drawable_quads_without_emitting_buffer_ranges() {
    let mut transparent = quad(
        "ui:transparent",
        DrawBatchPipeline::Ui,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0, 0, 0, 0),
            literal: "transparent".to_string(),
        },
        rect(0, 0, 20, 20),
        Vec::new(),
    );
    transparent.opacity = 0.0;

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![
        quad(
            "ui:none",
            DrawBatchPipeline::Ui,
            DrawCommandKind::UiSurface,
            WgpuNativeRenderPaint::None,
            rect(0, 0, 20, 20),
            Vec::new(),
        ),
        quad(
            "ui:invalid",
            DrawBatchPipeline::Text,
            DrawCommandKind::Text,
            WgpuNativeRenderPaint::InvalidColor {
                literal: "rgb(300,0,0)".to_string(),
            },
            rect(20, 0, 80, 20),
            Vec::new(),
        ),
        quad(
            "ui:empty",
            DrawBatchPipeline::Ui,
            DrawCommandKind::RoundedRect,
            WgpuNativeRenderPaint::Solid {
                color: rgba(0xff, 0xff, 0xff, 0xff),
                literal: "#fff".to_string(),
            },
            rect(10, 10, 0, 20),
            Vec::new(),
        ),
        transparent,
    ]));

    assert_eq!(plan.vertex_count, 0);
    assert_eq!(plan.index_count, 0);
    assert_eq!(plan.draw_call_count, 0);
    assert_eq!(plan.skipped_quad_count, 4);
    assert_eq!(plan.invalid_paint_count, 1);

    let skipped = &plan.passes[0].skipped_quads;
    assert_eq!(skipped.len(), 4);
    assert_eq!(skipped[0].command_id, "ui:none");
    assert_eq!(
        skipped[0].reason,
        WgpuNativeRenderSkippedQuadReason::NonDrawablePaint
    );
    assert_eq!(skipped[1].command_id, "ui:invalid");
    assert_eq!(
        skipped[1].reason,
        WgpuNativeRenderSkippedQuadReason::InvalidPaint
    );
    assert_eq!(skipped[2].command_id, "ui:empty");
    assert_eq!(
        skipped[2].reason,
        WgpuNativeRenderSkippedQuadReason::EmptyBounds
    );
    assert_eq!(skipped[3].command_id, "ui:transparent");
    assert_eq!(
        skipped[3].reason,
        WgpuNativeRenderSkippedQuadReason::Transparent
    );
}

#[test]
fn preserves_encoder_skip_reason_and_missing_resources() {
    let missing_resource_id = ResourceId::from("images:missing-panel.png");
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:missing-panel",
        DrawBatchPipeline::Ui,
        DrawCommandKind::Image,
        WgpuNativeRenderPaint::Skipped {
            reason: NativeBackendEncoderSkipReason::MissingResources,
            missing_resource_ids: vec![missing_resource_id.clone()],
        },
        rect(0, 0, 0, 0),
        vec![ResourceId::from("images:all-panel.png")],
    )]));

    assert_eq!(plan.vertex_count, 0);
    assert_eq!(plan.index_count, 0);
    assert_eq!(plan.draw_call_count, 0);
    assert_eq!(plan.skipped_quad_count, 1);

    let skipped = &plan.passes[0].skipped_quads[0];
    assert_eq!(skipped.command_id, "ui:missing-panel");
    assert_eq!(
        skipped.reason,
        WgpuNativeRenderSkippedQuadReason::MissingResources
    );
    assert_eq!(skipped.resource_ids, vec![missing_resource_id]);
}
