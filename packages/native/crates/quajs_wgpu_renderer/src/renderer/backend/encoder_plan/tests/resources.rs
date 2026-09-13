use super::support::draw_plan_with_resolved_resources;
use super::*;

#[test]
fn preserves_resource_bindings_for_encoder_draw_steps() {
    let draw_plan = draw_plan_with_resolved_resources(33);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let steps = encoder_plan.steps().collect::<Vec<_>>();

    let background_step = steps
        .iter()
        .find_map(|step| match step {
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                resource_bindings,
                ..
            } if command_id == "background:main" => Some(resource_bindings),
            _ => None,
        })
        .expect("expected background draw step");
    assert_eq!(background_step.len(), 1);
    assert_eq!(
        background_step[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(background_step[0].kind, Some(NativeResourceKind::Texture));
    assert_eq!(background_step[0].owner_package_id.as_deref(), Some("base"));

    let surface_step = steps
        .iter()
        .find_map(|step| match step {
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                resource_bindings,
                ..
            } if command_id == "ui:menu" => Some(resource_bindings),
            _ => None,
        })
        .expect("expected UI surface draw step");
    assert_eq!(surface_step.len(), 1);
    assert_eq!(
        surface_step[0].resource_id,
        ResourceId::from("surface:ui/menu.qui")
    );
    assert_eq!(surface_step[0].kind, Some(NativeResourceKind::UiAst));
    assert_eq!(
        surface_step[0].owner_package_id.as_deref(),
        Some("runtime.ui")
    );
}
