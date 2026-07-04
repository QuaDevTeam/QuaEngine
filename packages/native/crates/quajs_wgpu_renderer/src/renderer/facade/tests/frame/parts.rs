use crate::audio::NullNativeAudioBackend;
use crate::renderer::tests::view_with_audio;
use crate::renderer::NativeRenderer;

use super::super::{test_layout, view_with_background_and_choice, RecordingBackend};

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
