use super::super::{
    plan_audio_backend_commands, AudioBackendCommandKind, AudioBackendTrackStateMap,
};
use super::support::{asset, assets, provenance, set, track};
use crate::projection::audio::{
    AudioProjection, AudioTrackMemoryEstimate, AudioTrackPlaybackState,
};
use crate::resources::ResourceId;

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
fn fallback_package_candidates_skip_unsafe_projection_provenance() {
    let audio = AudioProjection::new(vec![track("bgm-main", "music/opening.ogg")
        .with_provenance(provenance("runtime/audio", ["base", "runtime/ui"]))]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    let track = plan.next_tracks.get("bgm-main").unwrap();
    assert_eq!(track.package_candidates, set(["base"]));
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
fn plans_stopping_projection_tracks_for_backend_fade_out() {
    let mut stopping = track("bgm-main", "music/opening.ogg");
    stopping.playback_state = AudioTrackPlaybackState::Stopping;
    stopping.fade_out_ms = Some(300.0);
    let audio = AudioProjection::new(vec![stopping]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, AudioBackendCommandKind::LoadAsset);
    assert_eq!(plan.commands[1].kind, AudioBackendCommandKind::StartTrack);
    assert_eq!(
        plan.next_tracks
            .get("bgm-main")
            .expect("stopping track stays active for fade out")
            .playback_state,
        AudioTrackPlaybackState::Stopping,
    );
}

#[test]
fn skips_tracks_with_empty_asset_names() {
    let audio = AudioProjection::new(vec![track("bgm-empty", ""), track("bgm-blank", "   ")]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert!(plan.is_empty());
    assert!(plan.next_tracks.is_empty());
}

#[test]
fn skips_tracks_with_unsafe_track_ids() {
    let audio = AudioProjection::new(vec![
        track("https://example.test/bgm", "music/a.ogg"),
        track("native:bgm", "music/b.ogg"),
        track("bad/bgm", "music/c.ogg"),
        track("plugin.dll", "music/d.ogg"),
        track("bgm:main", "music/opening.ogg"),
    ]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 2);
    assert!(plan.next_tracks.contains_key("bgm:main"));
    assert_eq!(plan.commands[0].track_id, "bgm:main");
    assert_eq!(plan.commands[1].track_id, "bgm:main");
    assert_eq!(
        plan.next_tracks.get("bgm:main").unwrap().handle_resource_id,
        ResourceId::from("audio:handle:bgm:bgm:bgm:main")
    );
}

#[test]
fn skips_duplicate_track_ids_in_backend_plans() {
    let audio = AudioProjection::new(vec![
        track("bgm-main", "music/first.ogg"),
        track("bgm-main", "music/second.ogg"),
        track("bgm-alt", "music/alt.ogg"),
    ]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 4);
    assert_eq!(
        plan.next_tracks.get("bgm-main").unwrap().media_resource_id,
        ResourceId::from("audio:buffer:bgm:bgm:music/first.ogg")
    );
    assert!(!plan
        .next_tracks
        .values()
        .any(|track| track.asset_name == "music/second.ogg"));
}

#[test]
fn skips_tracks_with_unsafe_resolved_numbers() {
    let mut bad_volume = track("bgm-bad-volume", "music/bad-volume.ogg");
    bad_volume.volume = 16.01;
    let bad_memory =
        track("bgm-bad-memory", "music/bad-memory.ogg").memory(AudioTrackMemoryEstimate {
            buffer_cpu_bytes: 2 * 1024 * 1024 * 1024 + 1,
            stream_cpu_bytes: 0,
            handle_cpu_bytes: 0,
        });
    let audio = AudioProjection::new(vec![
        bad_volume,
        bad_memory,
        track("bgm-valid", "music/valid.ogg"),
    ]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert_eq!(plan.commands.len(), 2);
    assert!(plan.next_tracks.contains_key("bgm-valid"));
    assert!(!plan.next_tracks.contains_key("bgm-bad-volume"));
    assert!(!plan.next_tracks.contains_key("bgm-bad-memory"));
}

#[test]
fn preserves_amplified_linear_gain_in_backend_plan() {
    for gain in [0.0, 1.995_262_3, 16.0] {
        let mut boosted = track("bgm-boost", "music/boost.ogg");
        boosted.volume = gain;
        let plan = plan_audio_backend_commands(
            &AudioBackendTrackStateMap::new(),
            Some(&AudioProjection::new(vec![boosted])),
            &assets([]),
        );
        assert_eq!(plan.next_tracks["bgm-boost"].volume, gain);
    }
}

#[test]
fn skips_tracks_with_unsafe_asset_names() {
    let audio = AudioProjection::new(vec![
        track("bgm-traversal", "../music/a.ogg"),
        track("bgm-url", "https://example.test/music/b.ogg"),
        track("bgm-absolute", "/music/c.ogg"),
        track("bgm-backslash", "music\\d.ogg"),
        track("bgm-payload", "music/native.dll?rev=1"),
    ]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert!(plan.is_empty());
    assert!(plan.next_tracks.is_empty());
}

#[test]
fn skips_tracks_with_empty_or_unsafe_asset_types() {
    let mut empty_type = track("bgm-empty-type", "music/a.ogg");
    empty_type.asset_type.clear();
    let mut blank_type = track("bgm-blank-type", "music/b.ogg");
    blank_type.asset_type = "   ".to_string();
    let mut path_type = track("bgm-path-type", "music/c.ogg");
    path_type.asset_type = "bgm/native".to_string();
    let mut symbol_type = track("bgm-symbol-type", "music/d.ogg");
    symbol_type.asset_type = "---".to_string();
    let audio = AudioProjection::new(vec![empty_type, blank_type, path_type, symbol_type]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert!(plan.is_empty());
    assert!(plan.next_tracks.is_empty());
}
