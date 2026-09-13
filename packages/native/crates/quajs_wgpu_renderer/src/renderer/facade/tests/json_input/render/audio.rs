use super::*;
use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::projection::audio::AudioTrackPlaybackState;

#[test]
fn can_apply_audio_backend_from_projection_json() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );

    let result = renderer
        .prepare_render_json_and_apply_audio_str(json_frame_with_audio_input())
        .expect("json frame input should render and apply audio");

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
    let audio_backend = renderer.audio_backend().unwrap();
    assert_eq!(audio_backend.diagnostics().active_track_count, 1);
    let track = audio_backend.active_tracks().get("bgm-main").unwrap();
    assert_eq!(track.playback_state, AudioTrackPlaybackState::Playing);
    assert!(track.looped);
    assert_eq!(track.volume, 0.8);
    assert_eq!(track.duration_ms, Some(2_400.0));
    assert_eq!(track.fade_in_ms, Some(150.0));
    assert_eq!(track.fade_out_ms, Some(300.0));
    assert_eq!(track.crossfade_ms, Some(450.0));
    assert_eq!(track.play_at, Some(1_700_000_000_750.0));
    assert_eq!(track.delay_ms, Some(750.0));
    assert_eq!(track.seek_ms, Some(1_200.0));
    assert_eq!(track.offset_ms, Some(50.0));
}
