use super::fixtures::*;
use super::*;

#[test]
fn preserves_clip_commands_and_child_clip_bounds() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 22,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission(&submission);
    let commands = plan.commands().collect::<Vec<_>>();
    let scroll_bounds = LogicalRect {
        x: 20.0,
        y: 30.0,
        width: 300.0,
        height: 160.0,
    };
    let clip_start = commands
        .iter()
        .find(|command| command.command_id == "ui:menu:scroll:clip-start")
        .unwrap();
    let inside = commands
        .iter()
        .find(|command| command.command_id == "ui:menu:inside")
        .unwrap();
    let clip_end = commands
        .iter()
        .find(|command| command.command_id == "ui:menu:scroll:clip-end")
        .unwrap();

    assert_eq!(clip_start.pipeline, DrawBatchPipeline::Clip);
    assert_eq!(clip_start.kind, DrawCommandKind::ClipStart);
    assert_eq!(clip_start.bounds, scroll_bounds);
    assert_eq!(
        clip_start.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert!(clip_start.clip_bounds.is_empty());

    assert_eq!(inside.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(inside.clip_bounds, vec![scroll_bounds]);
    assert_eq!(inside.bounds.x, 24.0);
    assert_eq!(inside.bounds.y, 44.0);
    match &inside.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Inside");
            assert_eq!(
                params.intent.as_ref().unwrap().element_id.as_deref(),
                Some("menu:inside")
            );
        }
        _ => panic!("expected scroll child UI button params"),
    }

    assert_eq!(clip_end.pipeline, DrawBatchPipeline::Clip);
    assert_eq!(clip_end.kind, DrawCommandKind::ClipEnd);
    assert_eq!(clip_end.bounds, scroll_bounds);
}
