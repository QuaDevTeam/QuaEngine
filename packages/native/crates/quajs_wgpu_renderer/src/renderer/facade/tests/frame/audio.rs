use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::renderer::tests::view_with_audio;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendErrorKind,
    NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderer, NativeRendererFrameError,
};

use super::super::{test_layout, RecordingBackend};

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
fn clear_applies_audio_teardown_before_dropping_renderer_state() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    renderer
        .prepare_frame_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();

    let released = renderer.clear_and_apply_audio_teardown().unwrap();

    assert_eq!(released.len(), 2);
    assert!(renderer.resources().is_empty());
    assert!(renderer.state().audio_backend_tracks().is_empty());
    let audio = renderer.audio_backend().unwrap();
    assert_eq!(audio.diagnostics().applied_plan_count, 2);
    assert_eq!(
        audio
            .diagnostics()
            .last_plan
            .unwrap()
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::StopTrack,
            AudioBackendCommandKind::ReleaseHandle,
        ]
    );
    assert_eq!(audio.diagnostics().active_track_count, 0);
}

#[test]
fn clear_with_audio_teardown_skips_empty_backend_plans() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );

    let released = renderer.clear_and_apply_audio_teardown().unwrap();

    assert!(released.is_empty());
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
fn clear_with_host_cleanup_can_apply_audio_teardown() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    renderer
        .prepare_frame_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();

    let (released, cleanup) = renderer
        .clear_with_host_cleanup_and_audio_teardown()
        .unwrap();

    assert_eq!(released.len(), 2);
    assert_eq!(cleanup.len(), 2);
    assert_eq!(renderer.audio_backend().unwrap().active_tracks().len(), 0);
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

struct RejectingBackend;

impl NativeRenderBackend for RejectingBackend {
    fn submit_frame(&mut self, _frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        Err(NativeRenderBackendError {
            kind: NativeRenderBackendErrorKind::BackendRejected,
            message: "test backend rejected frame".to_string(),
        })
    }
}
