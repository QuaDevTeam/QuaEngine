use super::fixtures::*;
use super::*;

#[test]
fn binds_resolved_resource_records_for_backend_encoding() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision: 24,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let commands = plan.commands().collect::<Vec<_>>();
    let background = commands
        .iter()
        .find(|command| command.command_id == "background:main")
        .unwrap();
    let overlay_surface = commands
        .iter()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();

    assert_eq!(plan.blocked_command_count, 0);
    assert_eq!(plan.drawable_command_count, submission.command_count);
    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert_eq!(
        background.resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(background.resource_bindings.len(), 1);
    let background_binding = &background.resource_bindings[0];
    assert_eq!(
        background_binding.resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        background_binding.state,
        NativeBackendDrawResourceBindingState::Resolved
    );
    assert_eq!(background_binding.kind, Some(NativeResourceKind::Texture));
    assert_eq!(background_binding.memory.cpu_bytes, 512);
    assert_eq!(background_binding.memory.gpu_bytes, 4096);
    assert_eq!(background_binding.owner_package_id.as_deref(), Some("base"));
    assert!(background_binding.required_package_ids.contains("base"));
    assert_eq!(
        background_binding.label.as_deref(),
        Some("school background")
    );

    assert_eq!(
        overlay_surface.resolved_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(overlay_surface.resource_bindings.len(), 1);
    let surface_binding = &overlay_surface.resource_bindings[0];
    assert_eq!(
        surface_binding.state,
        NativeBackendDrawResourceBindingState::Resolved
    );
    assert_eq!(surface_binding.kind, Some(NativeResourceKind::UiAst));
    assert_eq!(surface_binding.memory.cpu_bytes, 256);
    assert_eq!(surface_binding.memory.gpu_bytes, 0);
    assert_eq!(
        surface_binding.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(surface_binding.required_package_ids.contains("runtime.ui"));
}

#[test]
fn revalidates_resource_bindings_against_the_supplied_ledger() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let current_resources = ledger_with_background_and_surface();
    let stale_resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 25,
        frame: &frame,
        resources: &current_resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 0);

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &stale_resources);
    let commands = plan.commands().collect::<Vec<_>>();
    let background = commands
        .iter()
        .find(|command| command.command_id == "background:main")
        .unwrap();
    let overlay_surface = commands
        .iter()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();

    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        background.missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(background.resource_bindings.len(), 1);
    assert_eq!(
        background.resource_bindings[0].state,
        NativeBackendDrawResourceBindingState::Missing
    );
    assert!(background.resolved_resource_ids.is_empty());

    assert_eq!(
        overlay_surface.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        overlay_surface.missing_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(
        overlay_surface.resource_bindings[0].state,
        NativeBackendDrawResourceBindingState::Missing
    );
    assert_eq!(plan.blocked_command_count, 2);
    assert_eq!(plan.drawable_command_count, submission.command_count - 2);
}
