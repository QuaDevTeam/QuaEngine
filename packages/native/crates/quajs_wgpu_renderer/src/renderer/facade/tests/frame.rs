use super::*;
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::NullNativeRenderBackend;
use crate::resources::ResourceId;

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
    assert_eq!(result.submission.missing_resource_count, 0);
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
    assert_eq!(result.submission.passes[0].resolved_resource_count, 1);
    assert_eq!(result.submission.passes[0].missing_resource_count, 0);
    assert_eq!(result.submission.passes[1].resolved_resource_count, 0);
    assert_eq!(result.submission.passes[1].missing_resource_count, 0);
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
    assert_eq!(
        result.submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(result.submission.passes[0].batches[0]
        .missing_resource_ids
        .is_empty());
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
fn can_prepare_and_render_in_separate_steps() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let update = renderer.prepare_frame(test_layout(), &view_with_background_and_choice());
    let submission = renderer.render_frame().unwrap();

    assert_eq!(update.revision, 1);
    assert_eq!(submission.revision, 1);
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
