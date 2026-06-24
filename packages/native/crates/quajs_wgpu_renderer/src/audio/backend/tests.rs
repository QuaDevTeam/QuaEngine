use super::*;
use crate::audio::{
    AudioBackendCommand, AudioBackendCommandKind, AudioBackendCommandPlan, AudioBackendTrackState,
    AudioBackendTrackStateMap,
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
        package_candidates: ["runtime.audio"].into_iter().map(String::from).collect(),
        media_resource_id: ResourceId::from(format!("audio:buffer:bgm:bgm:{asset_name}")),
        handle_resource_id: ResourceId::from(format!("audio:handle:bgm:bgm:{id}")),
    }
}
