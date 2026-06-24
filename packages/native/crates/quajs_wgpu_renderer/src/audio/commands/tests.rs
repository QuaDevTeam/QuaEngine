use std::collections::BTreeSet;

use super::*;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
    AudioTrackProjection,
};
use crate::projection::common::PackageProvenance;
use crate::resources::{NativeAssetRequest, NativeAssetRequestPlan, NativeResourceKind};

#[test]
fn plans_load_and_start_commands_for_new_tracks() {
    let audio = AudioProjection::new(vec![track("bgm-main", "music/opening.ogg")
        .with_provenance(provenance("runtime.audio", ["base"]))]);
    let assets = assets([asset("bgm", "music/opening.ogg", ["runtime.audio", "base"])]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets);

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, AudioBackendCommandKind::LoadAsset);
    assert_eq!(plan.commands[1].kind, AudioBackendCommandKind::StartTrack);
    let track = plan.commands[1].track.as_ref().unwrap();
    assert_eq!(track.id, "bgm-main");
    assert_eq!(
        track.media_resource_id,
        ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    assert_eq!(
        track.handle_resource_id,
        ResourceId::from("audio:handle:bgm:bgm:bgm-main")
    );
    assert_eq!(track.package_candidates, set(["base", "runtime.audio"]));
    assert!(plan.next_tracks.contains_key("bgm-main"));
}

#[test]
fn plans_update_command_for_playback_changes_without_reloading_asset() {
    let mut previous = AudioBackendTrackStateMap::new();
    let previous_track = track_state(
        "bgm-main",
        "music/opening.ogg",
        1.0,
        AudioTrackPlaybackState::Playing,
    );
    previous.insert(previous_track.id.clone(), previous_track);
    let mut next_track = track("bgm-main", "music/opening.ogg");
    next_track.volume = 0.35;
    next_track.playback_state = AudioTrackPlaybackState::Paused;
    let audio = AudioProjection::new(vec![next_track]);

    let plan = plan_audio_backend_commands(&previous, Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0].kind, AudioBackendCommandKind::UpdateTrack);
    let track = plan.commands[0].track.as_ref().unwrap();
    assert_eq!(track.volume, 0.35);
    assert_eq!(track.playback_state, AudioTrackPlaybackState::Paused);
}

#[test]
fn replaces_backend_handle_when_track_identity_changes() {
    let mut previous = AudioBackendTrackStateMap::new();
    let previous_track = track_state(
        "voice-1",
        "voice/001.ogg",
        1.0,
        AudioTrackPlaybackState::Playing,
    );
    previous.insert(previous_track.id.clone(), previous_track);
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "voice-1",
        AudioTrackKind::Voice,
        "voice/002.ogg",
    )
    .streamed()]);

    let plan = plan_audio_backend_commands(&previous, Some(&audio), &assets([]));

    assert_eq!(
        plan.commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::StopTrack,
            AudioBackendCommandKind::ReleaseHandle,
            AudioBackendCommandKind::LoadAsset,
            AudioBackendCommandKind::StartTrack,
        ]
    );
    let started = plan.commands[3].track.as_ref().unwrap();
    assert_eq!(started.kind, AudioTrackKind::Voice);
    assert_eq!(started.load_mode, AudioTrackLoadMode::Streamed);
    assert_eq!(
        started.media_resource_id,
        ResourceId::from("audio:stream:voice:voice:voice/002.ogg")
    );
}

#[test]
fn stops_and_releases_tracks_removed_from_projection() {
    let mut previous = AudioBackendTrackStateMap::new();
    let previous_track = track_state(
        "bgm-main",
        "music/opening.ogg",
        1.0,
        AudioTrackPlaybackState::Playing,
    );
    previous.insert(previous_track.id.clone(), previous_track);

    let plan = plan_audio_backend_commands(&previous, None, &assets([]));

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, AudioBackendCommandKind::StopTrack);
    assert_eq!(
        plan.commands[1].kind,
        AudioBackendCommandKind::ReleaseHandle
    );
    assert!(plan.next_tracks.is_empty());
}

#[test]
fn skips_stopped_projection_tracks() {
    let mut stopped = track("bgm-main", "music/opening.ogg");
    stopped.playback_state = AudioTrackPlaybackState::Stopped;
    let audio = AudioProjection::new(vec![stopped]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert!(plan.is_empty());
    assert!(plan.next_tracks.is_empty());
}

#[test]
fn carries_skipped_asset_resource_ids_for_backend_diagnostics() {
    let audio = AudioProjection::new(vec![track("bgm-main", "music/opening.ogg")]);
    let asset_plan = NativeAssetRequestPlan {
        requests: Vec::new(),
        skipped_resource_ids: vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")],
    };

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &asset_plan);

    assert_eq!(
        plan.skipped_asset_resource_ids,
        vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")]
    );
}

fn track(id: &str, asset_name: &str) -> AudioTrackProjection {
    AudioTrackProjection::new(id, AudioTrackKind::Bgm, asset_name)
}

fn track_state(
    id: &str,
    asset_name: &str,
    volume: f32,
    playback_state: AudioTrackPlaybackState,
) -> AudioBackendTrackState {
    let mut projection = track(id, asset_name);
    projection.volume = volume;
    projection.playback_state = playback_state;
    audio_backend_track_state_for_test(&projection)
}

fn audio_backend_track_state_for_test(track: &AudioTrackProjection) -> AudioBackendTrackState {
    plan_audio_backend_commands(
        &AudioBackendTrackStateMap::new(),
        Some(&AudioProjection::new(vec![track.clone()])),
        &assets([]),
    )
    .next_tracks
    .remove(&track.id)
    .unwrap()
}

fn asset<const N: usize>(
    asset_type: &str,
    asset_name: &str,
    packages: [&str; N],
) -> NativeAssetRequest {
    NativeAssetRequest {
        resource_id: ResourceId::from(format!(
            "audio:buffer:{asset_type}:{asset_type}:{asset_name}"
        )),
        asset_type: asset_type.to_string(),
        asset_name: asset_name.to_string(),
        kind: NativeResourceKind::AudioBuffer,
        command_ids: BTreeSet::new(),
        package_candidates: set(packages),
    }
}

fn assets<const N: usize>(requests: [NativeAssetRequest; N]) -> NativeAssetRequestPlan {
    NativeAssetRequestPlan {
        requests: requests.into(),
        skipped_resource_ids: Vec::new(),
    }
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: set(required),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
