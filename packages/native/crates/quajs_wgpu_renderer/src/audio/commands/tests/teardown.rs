use super::super::{
    plan_audio_backend_commands, plan_audio_backend_package_teardown_commands,
    AudioBackendCommandKind, AudioBackendTrackStateMap,
};
use super::support::{assets, set, set_resources, track_state};
use crate::projection::audio::AudioTrackPlaybackState;

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
fn plans_package_teardown_for_tracks_that_reference_released_resources() {
    let mut previous = AudioBackendTrackStateMap::new();
    let mut runtime_track = track_state(
        "bgm-main",
        "music/opening.ogg",
        1.0,
        AudioTrackPlaybackState::Playing,
    );
    runtime_track.package_candidates = set(["runtime.audio"]);
    let mut base_track = track_state(
        "bgm-base",
        "music/base.ogg",
        0.5,
        AudioTrackPlaybackState::Playing,
    );
    base_track.package_candidates = set(["base"]);
    previous.insert(runtime_track.id.clone(), runtime_track);
    previous.insert(base_track.id.clone(), base_track);

    let plan = plan_audio_backend_package_teardown_commands(
        &previous,
        &set_resources(["audio:buffer:bgm:bgm:music/opening.ogg"]),
    );

    assert_eq!(
        plan.commands
            .iter()
            .map(|command| (command.track_id.as_str(), command.kind.clone()))
            .collect::<Vec<_>>(),
        vec![
            ("bgm-main", AudioBackendCommandKind::StopTrack),
            ("bgm-main", AudioBackendCommandKind::ReleaseHandle),
        ]
    );
    assert!(!plan.next_tracks.contains_key("bgm-main"));
    assert!(plan.next_tracks.contains_key("bgm-base"));
    assert!(plan.skipped_asset_resource_ids.is_empty());
}
