use super::*;
use crate::audio::{
    AudioBackendAssetLoad, AudioBackendCommand, AudioBackendCommandKind, AudioBackendCommandPlan,
    AudioBackendTrackState, AudioBackendTrackStateMap,
};
use crate::projection::audio::{AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState};
use crate::resources::ResourceId;

#[test]
fn null_backend_records_plans_and_active_tracks() {
    let mut backend = NullNativeAudioBackend::new();
    let plan = plan_with_track(track("bgm-main", "music/opening.ogg"));

    backend.apply_audio_commands(&plan).unwrap();

    assert_eq!(backend.applied_plans(), &[plan.clone()]);
    assert_eq!(backend.active_tracks().len(), 1);
    assert!(backend.active_tracks().contains_key("bgm-main"));
    assert_eq!(
        backend.diagnostics(),
        NullNativeAudioBackendDiagnostics {
            loaded_asset_count: 0,
            applied_plan_count: 1,
            applied_command_count: 2,
            active_track_count: 1,
            last_plan: Some(plan),
        }
    );
}

#[test]
fn null_backend_replaces_active_tracks_with_plan_state() {
    let mut backend = NullNativeAudioBackend::new();
    backend
        .apply_audio_commands(&plan_with_track(track("bgm-main", "music/opening.ogg")))
        .unwrap();
    let empty_plan = AudioBackendCommandPlan::default();

    backend.apply_audio_commands(&empty_plan).unwrap();

    assert!(backend.active_tracks().is_empty());
    assert_eq!(backend.applied_plans().len(), 2);
    assert_eq!(backend.diagnostics().active_track_count, 0);
}

#[test]
fn null_backend_can_record_asset_loads_for_backend_fixture_tests() {
    let mut backend = NullNativeAudioBackend::new();
    let load = AudioBackendAssetLoad {
        track_id: "bgm-main".to_string(),
        resource_id: ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
        asset_type: "bgm".to_string(),
        asset_name: "music/opening.ogg".to_string(),
        package_id: Some("runtime.audio".to_string()),
        bytes: vec![1, 2, 3, 4],
    };

    backend
        .apply_audio_asset_loads(std::slice::from_ref(&load))
        .unwrap();

    assert_eq!(backend.loaded_assets(), &[load]);
    assert_eq!(backend.diagnostics().loaded_asset_count, 1);
    assert!(!backend.wants_audio_asset_loads());
}

#[test]
fn null_backend_does_not_emit_audio_events() {
    let mut backend = NullNativeAudioBackend::new();

    assert!(backend.drain_audio_events().unwrap().is_empty());
}

fn plan_with_track(track: AudioBackendTrackState) -> AudioBackendCommandPlan {
    let mut next_tracks = AudioBackendTrackStateMap::new();
    next_tracks.insert(track.id.clone(), track.clone());

    AudioBackendCommandPlan {
        commands: vec![
            AudioBackendCommand {
                track_id: track.id.clone(),
                kind: AudioBackendCommandKind::LoadAsset,
                track: Some(track.clone()),
            },
            AudioBackendCommand {
                track_id: track.id.clone(),
                kind: AudioBackendCommandKind::StartTrack,
                track: Some(track),
            },
        ],
        next_tracks,
        skipped_asset_resource_ids: Vec::new(),
    }
}

fn track(id: &str, asset_name: &str) -> AudioBackendTrackState {
    AudioBackendTrackState {
        id: id.to_string(),
        kind: AudioTrackKind::Bgm,
        asset_type: "bgm".to_string(),
        asset_name: asset_name.to_string(),
        load_mode: AudioTrackLoadMode::Buffered,
        playback_state: AudioTrackPlaybackState::Playing,
        looped: true,
        volume: 1.0,
        duration_ms: None,
        fade_in_ms: None,
        fade_out_ms: None,
        crossfade_ms: None,
        play_at: None,
        delay_ms: None,
        seek_ms: None,
        offset_ms: None,
        processing: Vec::new(),
        package_candidates: ["runtime.audio"].into_iter().map(String::from).collect(),
        media_resource_id: ResourceId::from(format!("audio:buffer:bgm:bgm:{asset_name}")),
        handle_resource_id: ResourceId::from(format!("audio:handle:bgm:bgm:{id}")),
    }
}
