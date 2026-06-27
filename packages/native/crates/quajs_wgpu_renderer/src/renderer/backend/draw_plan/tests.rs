use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{NativeRenderBackend, NativeRenderFrameRef};
use crate::resources::{NativeResourceLedger, ResourceId};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

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
            "dialogue:panel",
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

#[test]
fn null_backend_records_backend_draw_plans() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = empty_resource_ledger();
    let mut backend = crate::renderer::NullNativeRenderBackend::new();

    let submission = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 23,
            frame: &frame,
            resources: &resources,
        })
        .unwrap();
    let expected_plan = NativeBackendDrawPlan::from_submission(&submission);

    assert_eq!(backend.draw_plans(), &[expected_plan.clone()]);
    assert_eq!(backend.last_draw_plan(), Some(&expected_plan));
    assert_eq!(
        backend.diagnostics().last_draw_plan.as_ref(),
        Some(&expected_plan)
    );
}

fn view_with_ui_scroll() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        dialogue: Some(DialogueProjection::say("Hello native")),
        choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
            "stay", "Stay",
        )])),
        ui: Some(UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "scroll",
                        UiSurfaceNodeKind::Scroll,
                        rect(20.0, 30.0, 300.0, 160.0),
                    )
                    .with_style(UiSurfaceResolvedStyle {
                        background_color: Some("#101820".to_string()),
                        border_radius: Some(12.0),
                        ..Default::default()
                    })
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "inside",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 44.0, 220.0, 56.0),
                    )
                    .with_text("Inside")
                    .with_intent(UiIntentProjection::new("inside"))]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }])),
        ..Default::default()
    }
}

fn empty_resource_ledger() -> NativeResourceLedger {
    NativeResourceLedger::new()
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
    }
}

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}
