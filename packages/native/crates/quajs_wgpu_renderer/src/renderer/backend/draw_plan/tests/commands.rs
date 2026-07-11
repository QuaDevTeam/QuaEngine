use super::fixtures::*;
use super::*;

#[test]
fn lowers_submission_commands_into_backend_draw_plan() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 21,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission(&submission);
    let commands = plan.commands().collect::<Vec<_>>();
    let command_ids = commands
        .iter()
        .map(|command| command.command_id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(plan.revision, 21);
    assert_eq!(plan.pass_count, submission.pass_count);
    assert_eq!(plan.batch_count, submission.batch_count);
    assert_eq!(plan.command_count, submission.command_count);
    assert_eq!(commands.len(), submission.command_count);
    assert_eq!(
        command_ids,
        vec![
            "background:main",
            "dialogue:shadow",
            "dialogue:panel",
            "dialogue:accent",
            "dialogue:text",
            "choices:panel",
            "choice:stay",
            "ui:menu",
            "ui:menu:scroll",
            "ui:menu:scroll:clip-start",
            "ui:menu:inside",
            "ui:menu:scroll:clip-end",
        ]
    );

    let background = commands[0];
    assert_eq!(background.sequence_index, 0);
    assert_eq!(background.pass_index, 0);
    assert_eq!(background.command_index, 0);
    assert_eq!(background.pipeline, DrawBatchPipeline::Image);
    assert_eq!(background.kind, DrawCommandKind::Image);
    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        background.missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    match &background.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "bg/school.png");
        }
        _ => panic!("expected image draw params"),
    }

    let dialogue_panel = commands
        .iter()
        .find(|command| command.command_id == "dialogue:panel")
        .unwrap();
    assert_eq!(dialogue_panel.pipeline, DrawBatchPipeline::Shape);
    assert_eq!(dialogue_panel.kind, DrawCommandKind::RoundedRect);
    assert_eq!(
        dialogue_panel.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    match &dialogue_panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "dialogue-panel");
            assert!(params.corner_radius > 0.0);
        }
        _ => panic!("expected panel draw params"),
    }

    let dialogue_text = commands
        .iter()
        .find(|command| command.command_id == "dialogue:text")
        .unwrap();
    assert_eq!(dialogue_text.pipeline, DrawBatchPipeline::Text);
    assert_eq!(dialogue_text.kind, DrawCommandKind::Text);
    assert_eq!(
        dialogue_text.resolved_resource_ids,
        Vec::<ResourceId>::new()
    );
    assert_eq!(
        dialogue_text.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    match &dialogue_text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Hello native");
            assert_eq!(params.role, "dialogue-text");
        }
        _ => panic!("expected text draw params"),
    }

    let choice = commands
        .iter()
        .find(|command| command.command_id == "choice:stay")
        .unwrap();
    assert_eq!(choice.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(choice.kind, DrawCommandKind::UiSurface);
    assert_eq!(choice.opacity, 1.0);
    match &choice.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Stay");
            assert!(params.enabled);
            assert_eq!(
                params.intent.as_ref().unwrap().choice_id.as_deref(),
                Some("stay")
            );
        }
        _ => panic!("expected UI button params"),
    }

    let overlay_surface = commands
        .iter()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();
    assert_eq!(overlay_surface.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(overlay_surface.kind, DrawCommandKind::UiSurface);
    assert_eq!(
        overlay_surface.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        overlay_surface.missing_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert!(commands
        .iter()
        .all(|command| command.resource_bindings.is_empty()));

    assert_eq!(plan.blocked_command_count, 2);
    assert_eq!(plan.drawable_command_count, submission.command_count - 2);
    assert_eq!(
        plan.drawable_commands()
            .map(|command| command.command_id.as_str())
            .collect::<Vec<_>>(),
        command_ids
            .iter()
            .copied()
            .filter(|command_id| !matches!(*command_id, "background:main" | "ui:menu"))
            .collect::<Vec<_>>()
    );
}
