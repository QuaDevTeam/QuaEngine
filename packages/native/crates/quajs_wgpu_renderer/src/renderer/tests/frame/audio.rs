use super::*;
use crate::audio::AudioBackendCommandKind;
use crate::projection::audio::AudioTrackPlaybackState;
use crate::projection::view::ViewProjection;
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

#[test]
fn prepares_audio_projection_resources_without_render_graph_commands() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_audio());

    assert_eq!(update.revision, 1);
    assert!(update.resource_sync.is_empty());
    assert_eq!(update.audio_resource_sync.upsert.len(), 2);
    assert_eq!(update.audio_resource_sync_summary.upsert_count, 2);
    assert_eq!(update.audio_assets.requests.len(), 1);
    assert_eq!(
        update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::LoadAsset,
            AudioBackendCommandKind::StartTrack,
        ]
    );
    assert_eq!(
        update
            .audio_assets
            .request("bgm", "music/opening.ogg")
            .unwrap()
            .kind,
        NativeResourceKind::AudioBuffer
    );
    assert_eq!(
        update.audio_assets.skipped_resource_ids,
        vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")]
    );
    assert_eq!(
        update.audio_resource_sync_summary.upsert_by_kind[&NativeResourceKind::AudioBuffer],
        1
    );
    assert_eq!(
        update.audio_resource_sync_summary.upsert_by_kind[&NativeResourceKind::AudioHandle],
        1
    );
    assert_eq!(state.frame().unwrap().summary.command_count, 0);
    assert!(state
        .resources()
        .get("audio:buffer:bgm:bgm:music/opening.ogg")
        .is_some());
    assert!(state
        .resources()
        .get("audio:handle:bgm:bgm:bgm-main")
        .is_some());
}

#[test]
fn releases_replaced_audio_resource_when_kind_changes() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new(
            "audio:buffer:bgm:bgm:music/opening.ogg",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("stale.audio")
        .memory(32, 0)
        .label("stale audio handle"),
    );

    let update = state.prepare_frame(test_layout(), &view_with_audio());
    let record = state
        .resources()
        .get("audio:buffer:bgm:bgm:music/opening.ogg")
        .unwrap();

    assert_eq!(update.audio_resource_sync.upsert.len(), 2);
    assert!(update.audio_resource_sync.release.is_empty());
    assert_eq!(update.released_resources.len(), 1);
    assert_eq!(
        update.released_resources[0].id,
        ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    assert_eq!(
        update.released_resources[0].kind,
        NativeResourceKind::AudioHandle
    );
    assert_eq!(update.host_cleanup.len(), 1);
    assert_eq!(update.host_cleanup[0].kind, NativeResourceKind::AudioHandle);
    assert_eq!(
        update.host_cleanup[0].owner_package_id.as_deref(),
        Some("stale.audio")
    );
    assert_eq!(update.audio_resource_sync_summary.release_count, 0);
    assert_eq!(update.audio_resource_sync_summary.released_count, 1);
    assert_eq!(
        update.audio_resource_sync_summary.replacement_release_count,
        1
    );
    assert_eq!(
        update.audio_resource_sync_summary.released_by_kind[&NativeResourceKind::AudioHandle],
        1
    );
    assert_eq!(record.kind, NativeResourceKind::AudioBuffer);
    assert_eq!(record.owner_package_id.as_deref(), Some("runtime.audio"));
}

#[test]
fn releases_audio_resources_when_projection_removes_them() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_audio());

    let update = state.prepare_frame(test_layout(), &ViewProjection::default());

    assert_eq!(
        update.audio_resource_sync.release,
        vec![
            ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
            ResourceId::from("audio:handle:bgm:bgm:bgm-main"),
        ]
    );
    assert_eq!(update.audio_resource_sync_summary.release_count, 2);
    assert_eq!(update.audio_resource_sync_summary.released_count, 2);
    assert_eq!(
        update.audio_resource_sync_summary.replacement_release_count,
        0
    );
    assert_eq!(
        update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::StopTrack,
            AudioBackendCommandKind::ReleaseHandle,
        ]
    );
    assert_eq!(
        update.audio_resource_sync_summary.released_by_kind[&NativeResourceKind::AudioBuffer],
        1
    );
    assert_eq!(
        update.audio_resource_sync_summary.released_by_kind[&NativeResourceKind::AudioHandle],
        1
    );
    assert_eq!(update.host_cleanup.len(), 2);
    assert!(state.resources().is_empty());
}

#[test]
fn prepares_audio_backend_update_commands_without_reloading_asset() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_audio());
    let mut view = view_with_audio();
    let track = view.audio.as_mut().unwrap().tracks.get_mut(0).unwrap();
    track.volume = 0.4;
    track.playback_state = AudioTrackPlaybackState::Paused;

    let update = state.prepare_frame(test_layout(), &view);

    assert_eq!(
        update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![AudioBackendCommandKind::UpdateTrack]
    );
    let track = update.audio_backend_commands.commands[0]
        .track
        .as_ref()
        .unwrap();
    assert_eq!(track.volume, 0.4);
    assert_eq!(track.playback_state, AudioTrackPlaybackState::Paused);
    assert_eq!(update.audio_resource_sync_summary.retain_count, 2);
}
