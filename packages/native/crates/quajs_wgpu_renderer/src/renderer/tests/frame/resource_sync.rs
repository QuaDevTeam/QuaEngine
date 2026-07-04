use super::*;
use crate::projection::view::ViewProjection;
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

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
    assert_eq!(update.resource_sync_summary.replacement_release_count, 0);
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
    assert!(!update.host_cleanup[0].declarative_asset);
    assert_eq!(
        update.host_cleanup[0].owner_package_id.as_deref(),
        Some("base")
    );
    assert_eq!(update.host_cleanup[0].memory.gpu_bytes, 4096);
    assert_eq!(update.resource_sync_summary.release_count, 1);
    assert_eq!(update.resource_sync_summary.released_count, 1);
    assert_eq!(update.resource_sync_summary.replacement_release_count, 0);
    assert_eq!(
        update.resource_sync_summary.released_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(update.resource_sync_summary.released_memory.cpu_bytes, 128);
    assert_eq!(update.resource_sync_summary.released_memory.gpu_bytes, 4096);
    assert!(state.resources().is_empty());
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
fn releases_replaced_resource_when_frame_resource_kind_changes() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Buffer)
            .owned_by("stale.package")
            .memory(64, 512)
            .label("stale upload buffer"),
    );

    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());
    let record = state.resources().get("images:bg/school.png").unwrap();

    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert!(update.resource_sync.release.is_empty());
    assert_eq!(update.released_resources.len(), 1);
    assert_eq!(
        update.released_resources[0].kind,
        NativeResourceKind::Buffer
    );
    assert_eq!(update.host_cleanup.len(), 1);
    assert_eq!(
        update.host_cleanup[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(update.host_cleanup[0].kind, NativeResourceKind::Buffer);
    assert_eq!(
        update.host_cleanup[0].owner_package_id.as_deref(),
        Some("stale.package")
    );
    assert_eq!(update.host_cleanup[0].memory.gpu_bytes, 512);
    assert_eq!(update.resource_sync_summary.release_count, 0);
    assert_eq!(update.resource_sync_summary.released_count, 1);
    assert_eq!(update.resource_sync_summary.replacement_release_count, 1);
    assert_eq!(
        update.resource_sync_summary.released_by_kind[&NativeResourceKind::Buffer],
        1
    );
    assert_eq!(record.kind, NativeResourceKind::Texture);
    assert_eq!(record.owner_package_id.as_deref(), Some("base"));
}
