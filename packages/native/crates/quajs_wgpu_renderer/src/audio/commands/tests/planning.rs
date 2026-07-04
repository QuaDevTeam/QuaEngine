use super::super::{
    plan_audio_backend_commands, AudioBackendCommandKind, AudioBackendTrackStateMap,
};
use super::support::{asset, assets, provenance, set, track};
use crate::projection::audio::{AudioProjection, AudioTrackPlaybackState};
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
fn skips_tracks_with_empty_asset_names() {
    let audio = AudioProjection::new(vec![track("bgm-empty", ""), track("bgm-blank", "   ")]);

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &assets([]));

    assert!(plan.is_empty());
    assert!(plan.next_tracks.is_empty());
}
