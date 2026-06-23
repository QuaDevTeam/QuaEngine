use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendErrorKind, NativeRenderBackendResult,
    NativeRenderFrameRef, NativeRenderSubmission,
};
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn prepares_frame_and_populates_resource_ledger() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 1);
    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert!(update.resource_sync.retain.is_empty());
    assert!(update.released_resources.is_empty());
    assert_eq!(state.frame().unwrap().summary.command_count, 3);
    assert_eq!(state.resources().len(), 1);
    assert!(state.resources().get("images:bg/school.png").is_some());
}

#[test]
fn retains_matching_resources_across_frame_updates() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 2);
    assert!(update.resource_sync.upsert.is_empty());
    assert_eq!(
        update.resource_sync.retain,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(update.resource_sync.release.is_empty());
    assert_eq!(state.resources().len(), 1);
}

#[test]
fn releases_frame_managed_resources_when_projection_removes_them() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let update = state.prepare_frame(test_layout(), &ViewProjection::default());

    assert_eq!(
        update.resource_sync.release,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(update.released_resources.len(), 1);
    assert!(state.resources().is_empty());
}

#[test]
fn preserves_resource_memory_when_metadata_refreshes() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("stale.package")
            .memory(128, 4096)
            .label("decoded background"),
    );

    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());
    let record = state.resources().get("images:bg/school.png").unwrap();

    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert_eq!(record.owner_package_id.as_deref(), Some("base"));
    assert_eq!(record.memory.cpu_bytes, 128);
    assert_eq!(record.memory.gpu_bytes, 4096);
    assert_eq!(record.label.as_deref(), Some("decoded background"));
}

#[test]
fn resolves_latest_frame_hit_intent() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());
    let choice = state
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = state
        .hit_intent(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn submits_latest_frame_to_backend() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());
    let mut backend = RecordingBackend::default();

    let submission = state.submit_latest_frame(&mut backend).unwrap();

    assert_eq!(backend.submissions, vec![submission.clone()]);
    assert_eq!(
        submission,
        NativeRenderSubmission {
            revision: 1,
            pass_count: 2,
            batch_count: 3,
            command_count: 3,
            resource_count: 1,
        }
    );
}

#[test]
fn rejects_submit_without_prepared_frame() {
    let state = NativeRendererState::new();
    let mut backend = RecordingBackend::default();

    let error = state.submit_latest_frame(&mut backend).unwrap_err();

    assert_eq!(error.kind, NativeRenderBackendErrorKind::NoPreparedFrame);
    assert!(backend.submissions.is_empty());
}

#[test]
fn clear_drops_latest_frame_and_releases_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let released = state.clear();

    assert_eq!(released.len(), 1);
    assert_eq!(state.revision(), 2);
    assert!(state.frame().is_none());
    assert!(state.resources().is_empty());
}

#[derive(Default)]
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
