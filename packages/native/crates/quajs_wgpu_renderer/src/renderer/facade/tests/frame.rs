use super::*;
use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::tests::view_with_audio;
use crate::renderer::NullNativeRenderBackend;
use crate::renderer::{NativeRenderBackendError, NativeRenderBackendErrorKind};
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
fn can_apply_audio_commands_through_explicit_audio_backend() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );

    let result = renderer
        .prepare_render_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();

    assert_eq!(result.submission.revision, 1);
    assert_eq!(
        result
            .update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::LoadAsset,
            AudioBackendCommandKind::StartTrack,
        ]
    );
    let audio = renderer.audio_backend().unwrap();
    assert_eq!(audio.diagnostics().applied_plan_count, 1);
    assert_eq!(audio.diagnostics().applied_command_count, 2);
    assert_eq!(audio.diagnostics().active_track_count, 1);
    assert!(audio.active_tracks().contains_key("bgm-main"));
}

#[test]
fn can_prepare_audio_update_without_render_submission() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    renderer
        .prepare_frame_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();
    let mut view = view_with_audio();
    view.audio.as_mut().unwrap().tracks[0].volume = 0.25;

    let update = renderer
        .prepare_frame_and_apply_audio(test_layout(), &view)
        .unwrap();

    assert_eq!(
        update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![AudioBackendCommandKind::UpdateTrack]
    );
    assert!(renderer.backend().submissions.is_empty());
    let audio = renderer.audio_backend().unwrap();
    assert_eq!(audio.diagnostics().applied_plan_count, 2);
    assert_eq!(audio.diagnostics().applied_command_count, 3);
    assert_eq!(audio.active_tracks()["bgm-main"].volume, 0.25);
}

#[test]
fn render_failure_does_not_apply_audio_commands() {
    let mut renderer =
        NativeRenderer::with_audio_backend(RejectingBackend, NullNativeAudioBackend::new());

    let error = renderer
        .prepare_render_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap_err();

    assert_eq!(
        error,
        NativeRendererFrameError::Render(NativeRenderBackendError::backend_rejected(
            "test backend rejected frame"
        ))
    );
    assert_eq!(
        renderer
            .audio_backend()
            .unwrap()
            .diagnostics()
            .applied_plan_count,
        0
    );
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

#[test]
fn can_be_split_back_into_state_render_backend_and_audio_backend() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    renderer
        .prepare_render_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();

    let (state, backend, audio_backend) = renderer.into_parts_with_audio();

    assert_eq!(state.revision(), 1);
    assert_eq!(backend.submissions.len(), 1);
    assert_eq!(audio_backend.unwrap().diagnostics().active_track_count, 1);
}

struct RejectingBackend;

impl NativeRenderBackend for RejectingBackend {
    fn submit_frame(&mut self, _frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        Err(NativeRenderBackendError {
            kind: NativeRenderBackendErrorKind::BackendRejected,
            message: "test backend rejected frame".to_string(),
        })
    }
}
