use super::super::{test_layout, RecordingBackend};
use super::support::audio_track_state;
use crate::audio::{
    AudioBackendCommandKind, AudioBackendCommandPlan, AudioBackendTrackStateMap,
    NativeAudioBackend, NativeAudioBackendError, NativeAudioBackendResult, NullNativeAudioBackend,
};
use crate::renderer::tests::view_with_audio;
use crate::renderer::NativeRenderer;
use crate::resources::{NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason};

#[test]
fn release_package_resources_with_audio_teardown_releases_inactive_audio_tracks() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    seed_inactive_runtime_audio(&mut renderer);

    let release = renderer
        .release_package_resources_and_apply_audio_teardown("runtime.audio")
        .unwrap();

    assert!(release.plan.can_unload());
    assert_eq!(release.released_resources.len(), 2);
    assert_eq!(release.host_cleanup.len(), 2);
    assert!(renderer.resources().is_empty());
    assert!(renderer.state().audio_backend_tracks().is_empty());
    let audio = renderer.audio_backend().unwrap();
    assert_eq!(audio.diagnostics().applied_plan_count, 1);
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
}

#[test]
fn release_package_resources_with_audio_teardown_failure_keeps_package_resources() {
    let mut renderer =
        NativeRenderer::with_audio_backend(RecordingBackend::default(), RejectingAudioBackend);
    seed_inactive_runtime_audio(&mut renderer);

    let error = renderer
        .release_package_resources_and_apply_audio_teardown("runtime.audio")
        .unwrap_err();

    assert_eq!(
        error,
        NativeAudioBackendError::backend_rejected("test audio backend rejected plan")
    );
    assert!(!renderer.resources().is_empty());
    assert!(renderer
        .state()
        .audio_backend_tracks()
        .contains_key("bgm-main"));
}

#[test]
fn release_package_resources_with_audio_teardown_keeps_active_audio_projection_blocked() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
    renderer
        .prepare_frame_and_apply_audio(test_layout(), &view_with_audio())
        .unwrap();

    let release = renderer
        .release_package_resources_and_apply_audio_teardown("runtime.audio")
        .unwrap();

    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(
        release.summary.blocked_by_reason[&PackageUnloadBlockerReason::ActiveFrameReference],
        2
    );
    assert_eq!(
        renderer
            .audio_backend()
            .unwrap()
            .diagnostics()
            .applied_plan_count,
        1
    );
    assert!(renderer
        .state()
        .audio_backend_tracks()
        .contains_key("bgm-main"));
}

fn seed_inactive_runtime_audio<A>(renderer: &mut NativeRenderer<RecordingBackend, A>) {
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new(
            "audio:buffer:bgm:bgm:music/opening.ogg",
            NativeResourceKind::AudioBuffer,
        )
        .owned_by("runtime.audio")
        .memory(2048, 0),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new(
            "audio:handle:bgm:bgm:bgm-main",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("runtime.audio")
        .memory(64, 0),
    );
    let mut tracks = AudioBackendTrackStateMap::new();
    tracks.insert("bgm-main".to_string(), audio_track_state("runtime.audio"));
    renderer.state_mut().replace_audio_backend_tracks(tracks);
}

struct RejectingAudioBackend;

impl NativeAudioBackend for RejectingAudioBackend {
    fn apply_audio_commands(
        &mut self,
        _plan: &AudioBackendCommandPlan,
    ) -> NativeAudioBackendResult {
        Err(NativeAudioBackendError::backend_rejected(
            "test audio backend rejected plan",
        ))
    }
}
