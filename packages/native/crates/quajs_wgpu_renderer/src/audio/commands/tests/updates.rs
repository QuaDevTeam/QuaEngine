use super::super::{
    plan_audio_backend_commands, AudioBackendCommandKind, AudioBackendTrackStateMap,
};
use super::support::{assets, track, track_state};
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
    AudioTrackProjection,
};
use crate::resources::ResourceId;

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
fn plans_update_command_for_timing_projection_changes_without_reloading_asset() {
    let mut previous = AudioBackendTrackStateMap::new();
    let mut previous_track = track_state(
        "bgm-main",
        "music/opening.ogg",
        1.0,
        AudioTrackPlaybackState::Playing,
    );
    previous_track.seek_ms = Some(1_000.0);
    previous_track.fade_in_ms = Some(250.0);
    previous_track.duration_ms = Some(2_400.0);
    previous.insert(previous_track.id.clone(), previous_track);
    let mut next_track = track("bgm-main", "music/opening.ogg");
    next_track.seek_ms = Some(1_500.0);
    next_track.duration_ms = Some(2_500.0);
    next_track.fade_in_ms = Some(250.0);
    next_track.fade_out_ms = Some(400.0);
    next_track.crossfade_ms = Some(300.0);
    next_track.play_at = Some(1_700_000_000_750.0);
    next_track.delay_ms = Some(750.0);
    next_track.offset_ms = Some(125.0);
    let audio = AudioProjection::new(vec![next_track]);

    let plan = plan_audio_backend_commands(&previous, Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0].kind, AudioBackendCommandKind::UpdateTrack);
    let track = plan.commands[0].track.as_ref().unwrap();
    assert_eq!(track.duration_ms, Some(2_500.0));
    assert_eq!(track.seek_ms, Some(1_500.0));
    assert_eq!(track.fade_in_ms, Some(250.0));
    assert_eq!(track.fade_out_ms, Some(400.0));
    assert_eq!(track.crossfade_ms, Some(300.0));
    assert_eq!(track.play_at, Some(1_700_000_000_750.0));
    assert_eq!(track.delay_ms, Some(750.0));
    assert_eq!(track.offset_ms, Some(125.0));
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
