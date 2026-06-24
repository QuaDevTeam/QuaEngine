use super::*;
use crate::audio::{
    AudioBackendCommandKind, AudioBackendTrackState, AudioBackendTrackStateMap,
    NullNativeAudioBackend,
};
use crate::projection::audio::{AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState};
use crate::renderer::tests::view_with_audio;
use crate::resources::{
    NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason, ResourceBudget,
    ResourceBudgetViolationCode, ResourceId,
};

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
fn plan_package_unload_blocks_active_projection_without_resources() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let plan = renderer.plan_package_unload("runtime.choices");

    assert!(!plan.can_unload());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("projection:runtime.choices")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveProjectionReference
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
fn release_package_resources_with_audio_teardown_releases_inactive_audio_tracks() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );
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

fn audio_track_state(package_id: &str) -> AudioBackendTrackState {
    AudioBackendTrackState {
        id: "bgm-main".to_string(),
        kind: AudioTrackKind::Bgm,
        asset_type: "bgm".to_string(),
        asset_name: "music/opening.ogg".to_string(),
        load_mode: AudioTrackLoadMode::Buffered,
        playback_state: AudioTrackPlaybackState::Playing,
        looped: false,
        volume: 1.0,
        package_candidates: [package_id.to_string()].into_iter().collect(),
        media_resource_id: ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
        handle_resource_id: ResourceId::from("audio:handle:bgm:bgm:bgm-main"),
    }
}

#[test]
fn clear_with_host_cleanup_returns_cleanup_records_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let (released, cleanup) = renderer.clear_with_host_cleanup();

    assert_eq!(released.len(), 1);
    assert_eq!(cleanup.len(), 1);
    assert_eq!(
        cleanup[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(cleanup[0].kind, NativeResourceKind::Texture);
    assert!(!cleanup[0].declarative_asset);
    assert!(renderer.resources().is_empty());
    assert_eq!(renderer.backend().submissions.len(), 1);
}
