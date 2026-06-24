use std::collections::BTreeSet;

use super::*;
use crate::input::{NativePointerButton, NativePointerEvent, NativePointerEventPhase};
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
    NullNativeRenderBackend,
};
use crate::resources::{
    NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason, ResourceBudget,
    ResourceBudgetViolationCode, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, stage_logical_to_client_point, ResolvedStageLayout, StageClientPoint,
    StageClientRectOrigin, StageContainerInput, StageLogicalPoint, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn prepares_and_submits_frame_through_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let result = renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.update.resource_sync.upsert.len(), 1);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.pass_count, 2);
    assert_eq!(result.submission.batch_count, 3);
    assert_eq!(result.submission.command_count, 4);
    assert_eq!(result.submission.resource_count, 1);
    assert_eq!(
        result
            .submission
            .passes
            .iter()
            .map(|pass| pass.plane)
            .collect::<Vec<_>>(),
        vec![RenderPlane::Scene, RenderPlane::Safe]
    );
    assert_eq!(result.submission.passes[0].batch_count, 1);
    assert_eq!(result.submission.passes[1].batch_count, 2);
    assert_eq!(
        result.submission.passes[0]
            .batches
            .iter()
            .map(|batch| batch.pipeline)
            .collect::<Vec<_>>(),
        vec![DrawBatchPipeline::Image]
    );
    assert_eq!(
        result.submission.passes[1]
            .batches
            .iter()
            .map(|batch| batch.pipeline)
            .collect::<Vec<_>>(),
        vec![DrawBatchPipeline::Shape, DrawBatchPipeline::Ui]
    );
    assert_eq!(renderer.backend().submissions, vec![result.submission]);
    assert_eq!(renderer.resources().len(), 1);
}

#[test]
fn renders_smoke_frame_with_null_backend() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    assert_eq!(result.submission.revision, 1);
    assert_eq!(renderer.backend().diagnostics().submitted_frames, 1);
    assert_eq!(
        renderer.backend().diagnostics().last_submission,
        Some(result.submission)
    );
}

#[test]
fn exposes_hit_intents_from_latest_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let choice = renderer
        .state()
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = renderer
        .hit_intent(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn exposes_pointer_intents_from_latest_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let choice = renderer
        .state()
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();
    let logical = StageLogicalPoint {
        x: choice.bounds.x + choice.bounds.width / 2.0,
        y: choice.bounds.y + choice.bounds.height / 2.0,
    };
    let origin = StageClientRectOrigin {
        left: 64.0,
        top: 32.0,
    };
    let client = stage_logical_to_client_point(
        &renderer.state().frame().unwrap().graph.layout,
        logical,
        origin,
    );

    let resolution = renderer.pointer_intent(client, origin).unwrap();

    assert!(resolution.point.inside_viewport);
    assert!(resolution.point.inside_stage);
    let hit = resolution.intent.unwrap();
    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn pointer_intent_returns_none_without_prepared_frame() {
    let renderer = NativeRenderer::new(RecordingBackend::default());

    let resolution = renderer.pointer_intent(
        StageClientPoint {
            client_x: 100.0,
            client_y: 120.0,
        },
        StageClientRectOrigin::default(),
    );

    assert!(resolution.is_none());
}

#[test]
fn pointer_release_event_dispatches_after_matching_press() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let press = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(press.event.pointer_id, 42);
    assert!(press.pointer.intent.is_some());
    assert!(press.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(resolution.event.pointer_id, 42);
    assert!(resolution.pointer.point.inside_viewport);
    assert!(resolution.pointer.point.inside_stage);
    assert_eq!(
        resolution
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        resolution
            .intent_to_dispatch
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_release_without_press_keeps_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        resolution
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert!(resolution.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_release_on_different_target_does_not_dispatch() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (stay_client, origin) = client_point_for_choice(&renderer, "choice:stay");
    let (leave_client, _) = client_point_for_choice(&renderer, "choice:leave");

    let press = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, stay_client, origin)
                .with_pointer_id(7)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        press
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let release = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, leave_client, origin)
                .with_pointer_id(7)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        release
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("leave")
    );
    assert!(release.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_cancel_clears_pressed_target() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let cancel = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Cancel, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert!(cancel.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );

    let release = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert!(release.pointer.intent.is_some());
    assert!(release.intent_to_dispatch.is_none());
}

#[test]
fn pointer_press_and_move_events_keep_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    for phase in [
        NativePointerEventPhase::Press,
        NativePointerEventPhase::Move,
    ] {
        let resolution = renderer
            .pointer_event(
                NativePointerEvent::new(phase, client, origin)
                    .with_button(NativePointerButton::Primary),
            )
            .unwrap();

        assert!(resolution.pointer.intent.is_some());
        assert!(resolution.intent_to_dispatch.is_none());
    }
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );
}

#[test]
fn pointer_secondary_release_keeps_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_button(NativePointerButton::Secondary),
        )
        .unwrap();

    assert!(resolution.pointer.intent.is_some());
    assert!(resolution.intent_to_dispatch.is_none());
}

#[test]
fn pointer_event_returns_none_without_prepared_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let resolution = renderer.pointer_event(NativePointerEvent::new(
        NativePointerEventPhase::Release,
        StageClientPoint {
            client_x: 100.0,
            client_y: 120.0,
        },
        StageClientRectOrigin::default(),
    ));

    assert!(resolution.is_none());
}

#[test]
fn can_prepare_and_render_in_separate_steps() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let update = renderer.prepare_frame(test_layout(), &view_with_background_and_choice());
    let submission = renderer.render_frame().unwrap();

    assert_eq!(update.revision, 1);
    assert_eq!(submission.revision, 1);
    assert_eq!(renderer.backend().submissions.len(), 1);
}

#[test]
fn check_resource_budget_forwards_state_ledger_violations() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("texture", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(10, 90),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("voice", NativeResourceKind::AudioBuffer)
            .owned_by("runtime.voice")
            .memory(50, 0),
    );

    let violations = renderer.check_resource_budget(&ResourceBudget {
        max_cpu_bytes: Some(40),
        max_gpu_bytes: Some(80),
        max_total_bytes: Some(120),
        max_resource_count: Some(1),
        max_resource_count_by_kind: Default::default(),
        max_memory_by_kind: Default::default(),
    });
    let codes: Vec<_> = violations.iter().map(|violation| violation.code).collect();

    assert_eq!(
        codes,
        vec![
            ResourceBudgetViolationCode::CpuBytesExceeded,
            ResourceBudgetViolationCode::GpuBytesExceeded,
            ResourceBudgetViolationCode::TotalBytesExceeded,
            ResourceBudgetViolationCode::ResourceCountExceeded,
        ]
    );
}

#[test]
fn plan_package_unload_blocks_active_frame_resource() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let plan = renderer.plan_package_unload("base");

    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveFrameReference
    );
}

#[test]
fn release_package_resources_releases_inactive_resources_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("runtime:atlas", NativeResourceKind::GlyphAtlas)
            .owned_by("runtime.ui")
            .memory(512, 2048),
    );

    let release = renderer.release_package_resources("runtime.ui");

    assert_eq!(release.revision, 2);
    assert!(release.plan.can_unload());
    assert_eq!(
        release.plan.releasable,
        vec![ResourceId::from("runtime:atlas")]
    );
    assert_eq!(release.released_resources.len(), 1);
    assert_eq!(
        release.released_resources[0].id,
        ResourceId::from("runtime:atlas")
    );
    assert_eq!(release.summary.releasable_count, 1);
    assert_eq!(release.summary.released_count, 1);
    assert_eq!(release.summary.released_memory.gpu_bytes, 2048);
    assert!(renderer.resources().get("runtime:atlas").is_none());
    assert!(renderer.resources().get("images:bg/school.png").is_some());
    assert_eq!(renderer.backend().submissions.len(), 1);
}

#[test]
fn clear_releases_resources_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let released = renderer.clear();

    assert_eq!(released.len(), 1);
    assert!(renderer.state().frame().is_none());
    assert!(renderer.resources().is_empty());
    assert_eq!(renderer.backend().submissions.len(), 1);
}

#[test]
fn can_be_split_back_into_state_and_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let (state, backend) = renderer.into_parts();

    assert_eq!(state.revision(), 1);
    assert_eq!(backend.submissions.len(), 1);
}

#[derive(Clone, Debug, Default, PartialEq)]
struct RecordingBackend {
    submissions: Vec<NativeRenderSubmission>,
}

impl NativeRenderBackend for RecordingBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

fn view_with_background_and_choice() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("stay", "Stay")
                },
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ],
        }),
        ..Default::default()
    }
}

fn test_layout() -> ResolvedStageLayout {
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

fn client_point_for_choice<B>(
    renderer: &NativeRenderer<B>,
    command_id: &str,
) -> (StageClientPoint, StageClientRectOrigin)
where
    B: NativeRenderBackend,
{
    let choice = renderer
        .state()
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == command_id)
        .unwrap();
    let logical = StageLogicalPoint {
        x: choice.bounds.x + choice.bounds.width / 2.0,
        y: choice.bounds.y + choice.bounds.height / 2.0,
    };
    let origin = StageClientRectOrigin {
        left: 64.0,
        top: 32.0,
    };
    let client = stage_logical_to_client_point(
        &renderer.state().frame().unwrap().graph.layout,
        logical,
        origin,
    );

    (client, origin)
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
