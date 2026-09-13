use super::support::draw_plan_with_resolved_resources;
use super::*;

#[test]
fn preserves_draw_metadata_for_encoder_steps() {
    let draw_plan = draw_plan_with_resolved_resources(34);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);

    let metadata = encoder_plan
        .steps()
        .find_map(|step| match step {
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                metadata,
                ..
            } if command_id == "ui:menu:inside" => Some(metadata),
            _ => None,
        })
        .expect("expected inside button draw metadata");

    assert_eq!(
        metadata.bounds,
        LogicalRect {
            x: 24.0,
            y: 44.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(metadata.opacity, 1.0);
    assert!(matches!(metadata.params, DrawCommandParams::UiButton(_)));
    assert_eq!(metadata.owner_package_id.as_deref(), Some("runtime.menu"));
    assert!(metadata.required_package_ids.contains("runtime.ui"));
}
