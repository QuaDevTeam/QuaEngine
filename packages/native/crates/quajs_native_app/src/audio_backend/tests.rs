use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendCommand, AudioBackendCommandKind, AudioBackendCommandPlan,
    AudioBackendTrackState, AudioBackendTrackStateMap, NativeAudioBackend, NativeAudioBackendEvent,
};
use quajs_wgpu_renderer::projection::audio::{
    AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
};
use quajs_wgpu_renderer::resources::ResourceId;

use super::playback::{NativeAudioPlaybackBackend, NativeAudioPlaybackDriver};

#[test]
fn playback_backend_loads_package_audio_before_starting_tracks() {
    let track = track("bgm-main", "music/opening.ogg");
    let load = load_for_track(&track, [1, 2, 3, 4]);
    let mut backend = NativeAudioPlaybackBackend::new(RecordingPlaybackDriver::default());

    backend
        .apply_audio_asset_loads(std::slice::from_ref(&load))
        .expect("asset load should be recorded");
    backend
        .apply_audio_commands(&plan_with_commands(
            [
                command(AudioBackendCommandKind::LoadAsset, &track),
                command(AudioBackendCommandKind::StartTrack, &track),
            ],
            [track.clone()],
        ))
        .expect("loaded audio track should start");

    assert!(backend.wants_audio_asset_loads());
    assert_eq!(backend.diagnostics().applied_asset_load_batch_count, 1);
    assert_eq!(backend.diagnostics().loaded_asset_count, 1);
    assert_eq!(backend.diagnostics().active_track_count, 1);
    assert_eq!(
        backend.driver().events,
        vec!["start:bgm-main:music/opening.ogg:4"]
    );
}

#[test]
fn playback_backend_rejects_start_without_loaded_audio_bytes() {
    let track = track("bgm-main", "music/opening.ogg");
    let mut backend = NativeAudioPlaybackBackend::new(RecordingPlaybackDriver::default());

    let error = backend
        .apply_audio_commands(&plan_with_commands(
            [command(AudioBackendCommandKind::StartTrack, &track)],
            [track],
        ))
        .expect_err("starting without bytes should fail");

    assert!(error.message.contains("has not been loaded"));
    assert_eq!(backend.diagnostics().active_track_count, 0);
    assert!(backend.driver().events.is_empty());
}

#[test]
fn playback_backend_updates_stops_and_releases_active_tracks() {
    let track = track("bgm-main", "music/opening.ogg");
    let load = load_for_track(&track, [1, 2, 3, 4]);
    let mut backend = NativeAudioPlaybackBackend::new(RecordingPlaybackDriver::default());
    backend
        .apply_audio_asset_loads(std::slice::from_ref(&load))
        .expect("asset load should be recorded");
    backend
        .apply_audio_commands(&plan_with_commands(
            [command(AudioBackendCommandKind::StartTrack, &track)],
            [track.clone()],
        ))
        .expect("loaded audio track should start");

    let mut paused = track.clone();
    paused.playback_state = AudioTrackPlaybackState::Paused;
    backend
        .apply_audio_commands(&plan_with_commands(
            [
                command(AudioBackendCommandKind::UpdateTrack, &paused),
                command(AudioBackendCommandKind::StopTrack, &paused),
                command(AudioBackendCommandKind::ReleaseHandle, &paused),
            ],
            [],
        ))
        .expect("active audio track should update and release");

    assert_eq!(backend.diagnostics().active_track_count, 0);
    assert_eq!(backend.diagnostics().loaded_asset_count, 0);
    assert_eq!(
        backend.driver().events,
        vec![
            "start:bgm-main:music/opening.ogg:4",
            "update:bgm-main:paused",
            "stop:bgm-main",
            "release:bgm-main",
        ]
    );
}

#[test]
fn playback_backend_forwards_timing_controls_to_driver_state() {
    let mut track = track("bgm-main", "music/opening.ogg");
    track.duration_ms = Some(2_400.0);
    track.fade_in_ms = Some(150.0);
    track.crossfade_ms = Some(300.0);
    track.play_at = Some(1_700_000_000_750.0);
    track.delay_ms = Some(750.0);
    track.seek_ms = Some(1_200.0);
    track.offset_ms = Some(50.0);
    let load = load_for_track(&track, [1, 2, 3, 4]);
    let mut backend = NativeAudioPlaybackBackend::new(RecordingPlaybackDriver::default());

    backend
        .apply_audio_asset_loads(std::slice::from_ref(&load))
        .expect("asset load should be recorded");
    backend
        .apply_audio_commands(&plan_with_commands(
            [command(AudioBackendCommandKind::StartTrack, &track)],
            [track.clone()],
        ))
        .expect("loaded audio track should start");

    let mut updated = track.clone();
    updated.seek_ms = Some(1_500.0);
    updated.fade_out_ms = Some(450.0);
    backend
        .apply_audio_commands(&plan_with_commands(
            [command(AudioBackendCommandKind::UpdateTrack, &updated)],
            [updated],
        ))
        .expect("active audio track should update");

    assert_eq!(
        backend.driver().started_tracks[0].duration_ms,
        Some(2_400.0)
    );
    assert_eq!(backend.driver().started_tracks[0].fade_in_ms, Some(150.0));
    assert_eq!(backend.driver().started_tracks[0].crossfade_ms, Some(300.0));
    assert_eq!(
        backend.driver().started_tracks[0].play_at,
        Some(1_700_000_000_750.0)
    );
    assert_eq!(backend.driver().started_tracks[0].delay_ms, Some(750.0));
    assert_eq!(backend.driver().started_tracks[0].seek_ms, Some(1_200.0));
    assert_eq!(backend.driver().started_tracks[0].offset_ms, Some(50.0));
    assert_eq!(backend.driver().updated_tracks[0].seek_ms, Some(1_500.0));
    assert_eq!(backend.driver().updated_tracks[0].fade_out_ms, Some(450.0));
}

#[test]
fn playback_backend_drains_finished_tracks_as_audio_events_once() {
    let mut track = track("voice-line-1", "voice/ch01/line-1.ogg");
    track.kind = AudioTrackKind::Voice;
    track.asset_type = "voice".to_string();
    track.looped = false;
    let load = load_for_track(&track, [1, 2, 3, 4]);
    let driver = RecordingPlaybackDriver {
        finished_track_ids: vec![track.id.clone()],
        ..Default::default()
    };
    let mut backend = NativeAudioPlaybackBackend::new(driver);
    backend
        .apply_audio_asset_loads(std::slice::from_ref(&load))
        .expect("asset load should be recorded");
    backend
        .apply_audio_commands(&plan_with_commands(
            [command(AudioBackendCommandKind::StartTrack, &track)],
            [track.clone()],
        ))
        .expect("loaded audio track should start");

    let events = backend
        .drain_audio_events()
        .expect("finished audio events should drain");
    let second = backend
        .drain_audio_events()
        .expect("finished audio events should not repeat");

    assert_eq!(
        events,
        vec![NativeAudioBackendEvent::TrackEnded {
            track: track.clone(),
            reason: "natural".to_string(),
        }]
    );
    assert!(second.is_empty());
    assert_eq!(backend.diagnostics().active_track_count, 0);
    assert_eq!(
        backend.driver().events,
        vec![
            "start:voice-line-1:voice/ch01/line-1.ogg:4",
            "finished:voice-line-1",
        ]
    );
}

#[derive(Default, Debug)]
struct RecordingPlaybackDriver {
    events: Vec<String>,
    finished_track_ids: Vec<String>,
    started_tracks: Vec<AudioBackendTrackState>,
    updated_tracks: Vec<AudioBackendTrackState>,
}

impl NativeAudioPlaybackDriver for RecordingPlaybackDriver {
    fn start_track(
        &mut self,
        track: &AudioBackendTrackState,
        load: &AudioBackendAssetLoad,
    ) -> Result<(), String> {
        self.started_tracks.push(track.clone());
        self.events.push(format!(
            "start:{}:{}:{}",
            track.id,
            load.asset_name,
            load.bytes.len()
        ));
        Ok(())
    }

    fn update_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        self.updated_tracks.push(track.clone());
        self.events.push(format!(
            "update:{}:{}",
            track.id,
            playback_label(track.playback_state)
        ));
        Ok(())
    }

    fn stop_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        self.events.push(format!("stop:{}", track.id));
        Ok(())
    }

    fn release_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        self.events.push(format!("release:{}", track.id));
        Ok(())
    }

    fn drain_finished_tracks(
        &mut self,
        active_tracks: &AudioBackendTrackStateMap,
    ) -> Result<Vec<AudioBackendTrackState>, String> {
        let finished_ids = std::mem::take(&mut self.finished_track_ids);
        let mut finished_tracks = Vec::with_capacity(finished_ids.len());
        for track_id in finished_ids {
            if let Some(track) = active_tracks.get(&track_id) {
                self.events.push(format!("finished:{track_id}"));
                finished_tracks.push(track.clone());
            }
        }
        Ok(finished_tracks)
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
        volume: 0.8,
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

fn load_for_track<const N: usize>(
    track: &AudioBackendTrackState,
    bytes: [u8; N],
) -> AudioBackendAssetLoad {
    AudioBackendAssetLoad {
        track_id: track.id.clone(),
        resource_id: track.media_resource_id.clone(),
        asset_type: track.asset_type.clone(),
        asset_name: track.asset_name.clone(),
        package_id: Some("runtime.audio".to_string()),
        bytes: bytes.into(),
    }
}

fn command(kind: AudioBackendCommandKind, track: &AudioBackendTrackState) -> AudioBackendCommand {
    AudioBackendCommand {
        track_id: track.id.clone(),
        kind,
        track: Some(track.clone()),
    }
}

fn plan_with_commands<const C: usize, const T: usize>(
    commands: [AudioBackendCommand; C],
    tracks: [AudioBackendTrackState; T],
) -> AudioBackendCommandPlan {
    let mut next_tracks = AudioBackendTrackStateMap::new();
    for track in tracks {
        next_tracks.insert(track.id.clone(), track);
    }
    AudioBackendCommandPlan {
        commands: commands.into(),
        next_tracks,
        skipped_asset_resource_ids: Vec::new(),
    }
}

fn playback_label(state: AudioTrackPlaybackState) -> &'static str {
    match state {
        AudioTrackPlaybackState::Playing => "playing",
        AudioTrackPlaybackState::Paused => "paused",
        AudioTrackPlaybackState::Stopping => "stopping",
        AudioTrackPlaybackState::Stopped => "stopped",
    }
}
