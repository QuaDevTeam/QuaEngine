use super::fixtures::*;
use super::*;

#[test]
fn null_backend_records_backend_draw_plans() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let mut backend = crate::renderer::NullNativeRenderBackend::new();

    let submission = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 23,
            frame: &frame,
            resources: &resources,
        })
        .unwrap();
    let expected_plan =
        NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);

    assert_eq!(backend.draw_plans(), &[expected_plan.clone()]);
    assert_eq!(backend.last_draw_plan(), Some(&expected_plan));
    assert_eq!(
        backend.diagnostics().last_draw_plan.as_ref(),
        Some(&expected_plan)
    );
    assert!(expected_plan
        .commands()
        .filter(|command| !command.resource_ids.is_empty())
        .all(|command| !command.resource_bindings.is_empty()));
}
