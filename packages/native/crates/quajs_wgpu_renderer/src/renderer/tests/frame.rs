use super::*;
use crate::audio::AudioBackendCommandKind;
use crate::projection::audio::AudioTrackPlaybackState;
use crate::projection::view::ViewProjection;
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

#[test]
fn prepares_frame_and_populates_resource_ledger() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 1);
    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert!(update.resource_sync.retain.is_empty());
    assert!(update.released_resources.is_empty());
    assert_eq!(update.resource_sync_summary.upsert_count, 1);
    assert_eq!(
        update.resource_sync_summary.upsert_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(update.resource_sync_summary.release_count, 0);
    assert_eq!(update.resource_sync_summary.released_count, 0);
    assert_eq!(state.frame().unwrap().summary.command_count, 3);
    assert_eq!(state.resources().len(), 1);
    assert!(state.resources().get("images:bg/school.png").is_some());
}

#[test]
fn retains_matching_resources_across_frame_updates() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 2);
    assert!(update.resource_sync.upsert.is_empty());
    assert_eq!(
        update.resource_sync.retain,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(update.resource_sync.release.is_empty());
    assert_eq!(update.resource_sync_summary.upsert_count, 0);
    assert_eq!(update.resource_sync_summary.retain_count, 1);
    assert_eq!(update.resource_sync_summary.release_count, 0);
    assert_eq!(update.resource_sync_summary.released_count, 0);
    assert_eq!(state.resources().len(), 1);
}

#[test]
fn releases_frame_managed_resources_when_projection_removes_them() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());
    state.resources_mut().insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );

    let update = state.prepare_frame(test_layout(), &ViewProjection::default());

    assert_eq!(
        update.resource_sync.release,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(update.released_resources.len(), 1);
    assert_eq!(update.host_cleanup.len(), 1);
    assert_eq!(
        update.host_cleanup[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(update.host_cleanup[0].kind, NativeResourceKind::Texture);
    assert_eq!(
        update.host_cleanup[0].owner_package_id.as_deref(),
        Some("base")
    );
    assert_eq!(update.host_cleanup[0].memory.gpu_bytes, 4096);
    assert_eq!(update.resource_sync_summary.release_count, 1);
    assert_eq!(update.resource_sync_summary.released_count, 1);
    assert_eq!(
        update.resource_sync_summary.released_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(update.resource_sync_summary.released_memory.cpu_bytes, 128);
    assert_eq!(update.resource_sync_summary.released_memory.gpu_bytes, 4096);
    assert!(state.resources().is_empty());
}

#[test]
fn summarizes_declarative_ui_resource_sync() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_ui_surface());

    assert_eq!(update.resource_sync_summary.upsert_count, 1);
    assert_eq!(update.resource_sync_summary.declarative_upsert_count, 1);
    assert_eq!(
        update.resource_sync_summary.upsert_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(
        state
            .resources()
            .get("surface:ui/menu.qui")
            .unwrap()
            .owner_package_id
            .as_deref(),
        Some("runtime.ui")
    );

    let release = state.prepare_frame(test_layout(), &ViewProjection::default());

    assert_eq!(release.resource_sync_summary.release_count, 1);
    assert_eq!(release.resource_sync_summary.released_count, 1);
    assert_eq!(release.resource_sync_summary.declarative_released_count, 1);
    assert_eq!(
        release.resource_sync_summary.released_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert!(
        release
            .resource_sync_summary
            .declarative_released_memory
            .cpu_bytes
            > 0
    );
    assert_eq!(
        release
            .resource_sync_summary
            .declarative_released_memory
            .gpu_bytes,
        0
    );
}

#[test]
fn preserves_resource_memory_when_metadata_refreshes() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("stale.package")
            .memory(128, 4096)
            .label("decoded background"),
    );

    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());
    let record = state.resources().get("images:bg/school.png").unwrap();

    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert_eq!(record.owner_package_id.as_deref(), Some("base"));
    assert_eq!(record.memory.cpu_bytes, 128);
    assert_eq!(record.memory.gpu_bytes, 4096);
    assert_eq!(record.label.as_deref(), Some("decoded background"));
}

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
