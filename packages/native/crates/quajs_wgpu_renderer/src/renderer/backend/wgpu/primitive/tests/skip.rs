use super::*;

#[test]
fn keeps_skipped_draws_as_non_visible_primitives() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::SkipDraw {
            command_id: "background:main".to_string(),
            pipeline: DrawBatchPipeline::Image,
            kind: DrawCommandKind::Image,
            metadata: draw_metadata(DrawCommandParams::None),
            reason: NativeBackendEncoderSkipReason::MissingResources,
            missing_resource_ids: vec![ResourceId::from("images:bg/school.png")],
        },
    ]));

    assert_eq!(plan.primitive_count, 1);
    assert_eq!(plan.visible_primitive_count, 0);
    assert_eq!(plan.skipped_draw_count, 1);

    let primitive = &plan.passes[0].primitives[0];
    assert!(!primitive.is_visible());
    assert_eq!(primitive.physical_bounds, WgpuPhysicalRect::default());
    assert!(matches!(
        &primitive.kind,
        WgpuNativeRenderPrimitiveKind::Skipped {
            reason: NativeBackendEncoderSkipReason::MissingResources,
            missing_resource_ids,
        } if missing_resource_ids == &vec![ResourceId::from("images:bg/school.png")]
    ));
}
