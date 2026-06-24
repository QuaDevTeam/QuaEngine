use super::*;
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::NativeRenderBackendErrorKind;
use crate::resources::ResourceId;

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
    assert_eq!(submission.revision, 1);
    assert_eq!(submission.pass_count, 2);
    assert_eq!(submission.batch_count, 3);
    assert_eq!(submission.command_count, 3);
    assert_eq!(submission.resource_count, 1);
    assert_eq!(submission.missing_resource_count, 0);
    assert_eq!(
        submission
            .passes
            .iter()
            .map(|pass| pass.plane)
            .collect::<Vec<_>>(),
        vec![RenderPlane::Scene, RenderPlane::Safe]
    );
    assert_eq!(submission.passes[0].batch_count, 1);
    assert_eq!(submission.passes[0].command_count, 1);
    assert_eq!(submission.passes[0].resolved_resource_count, 1);
    assert_eq!(submission.passes[0].missing_resource_count, 0);
    assert_eq!(submission.passes[1].batch_count, 2);
    assert_eq!(submission.passes[1].command_count, 2);
    assert_eq!(submission.passes[1].resolved_resource_count, 0);
    assert_eq!(submission.passes[1].missing_resource_count, 0);
    assert_eq!(
        submission.passes[0]
            .batches
            .iter()
            .map(|batch| batch.pipeline)
            .collect::<Vec<_>>(),
        vec![DrawBatchPipeline::Image]
    );
    assert_eq!(
        submission.passes[1]
            .batches
            .iter()
            .map(|batch| batch.pipeline)
            .collect::<Vec<_>>(),
        vec![DrawBatchPipeline::Shape, DrawBatchPipeline::Ui]
    );
    assert_eq!(
        submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(submission.passes[0].batches[0]
        .missing_resource_ids
        .is_empty());
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
