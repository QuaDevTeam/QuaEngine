use super::support::draw_plan_with_empty_resources;
use super::*;

#[test]
fn lowers_draw_plan_into_encoder_steps() {
    let draw_plan = draw_plan_with_empty_resources(31);

    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let steps = encoder_plan.steps().collect::<Vec<_>>();
    let first_pass = &encoder_plan.passes[0];

    assert_eq!(encoder_plan.revision, 31);
    assert_eq!(encoder_plan.pass_count, draw_plan.pass_count);
    assert_eq!(encoder_plan.step_count, steps.len());
    assert_eq!(first_pass.step_count, first_pass.steps.len());
    assert!(matches!(
        first_pass.steps.first(),
        Some(NativeBackendEncoderStep::BeginPass { .. })
    ));
    assert!(matches!(
        first_pass.steps.last(),
        Some(NativeBackendEncoderStep::EndPass { .. })
    ));
    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::BindPipeline {
                pipeline: DrawBatchPipeline::Image
            }
        )
    }));
    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::BindPipeline {
                pipeline: DrawBatchPipeline::Ui
            }
        )
    }));

    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                kind: DrawCommandKind::Text,
                clip_depth: 0,
                ..
            } if command_id == "dialogue:text"
        )
    }));
    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::SkipCommand {
                command_id,
                reason: NativeBackendEncoderSkipReason::MissingResources,
                missing_resource_ids,
                ..
            } if command_id == "background:main"
                && missing_resource_ids == &vec![ResourceId::from("images:bg/school.png")]
        )
    }));
    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::SkipCommand {
                command_id,
                reason: NativeBackendEncoderSkipReason::MissingResources,
                missing_resource_ids,
                ..
            } if command_id == "ui:menu"
                && missing_resource_ids == &vec![ResourceId::from("surface:ui/menu.qui")]
        )
    }));
    assert_eq!(encoder_plan.skipped_draw_step_count, 2);
    assert_eq!(
        encoder_plan.draw_step_count,
        draw_plan.drawable_command_count
    );
}
