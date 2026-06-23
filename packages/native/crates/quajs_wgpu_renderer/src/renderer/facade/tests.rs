use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
    NullNativeRenderBackend,
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
    assert_eq!(
        result.submission,
        NativeRenderSubmission {
            revision: 1,
            pass_count: 2,
            batch_count: 3,
            command_count: 3,
            resource_count: 1,
        }
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
fn can_prepare_and_render_in_separate_steps() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let update = renderer.prepare_frame(test_layout(), &view_with_background_and_choice());
    let submission = renderer.render_frame().unwrap();

    assert_eq!(update.revision, 1);
    assert_eq!(submission.revision, 1);
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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
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
            choices: vec![ChoiceProjection {
                provenance: provenance("runtime.choices", ["base"]),
                ..ChoiceProjection::new("stay", "Stay")
            }],
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

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
