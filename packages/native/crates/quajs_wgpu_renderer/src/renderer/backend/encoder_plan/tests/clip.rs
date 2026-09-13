use super::support::draw_plan_with_empty_resources;
use super::*;

#[test]
fn synchronizes_clip_stack_around_clipped_commands() {
    let draw_plan = draw_plan_with_empty_resources(32);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let steps = encoder_plan.steps().collect::<Vec<_>>();
    let scroll_bounds = LogicalRect {
        x: 20.0,
        y: 30.0,
        width: 300.0,
        height: 160.0,
    };

    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::PushClip { bounds, depth: 1 } if *bounds == scroll_bounds
        )
    }));
    assert!(steps
        .iter()
        .any(|step| { matches!(step, NativeBackendEncoderStep::PopClip { depth: 1 }) }));
    assert!(steps.iter().any(|step| {
        matches!(
            step,
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                clip_depth: 1,
                ..
            } if command_id == "ui:menu:inside"
        )
    }));
}
