use quajs_wgpu_renderer::resources::{NativeTextureUploadSyncPlan, ResourceId};

use crate::texture_sync::sync_pending_texture_uploads_from_host;

use super::super::support::{
    RecordingAssetHost, RecordingTextureUploadSink, TextureResidentBackend,
};

#[test]
fn preserves_resident_count_and_skips_existing_textures() {
    let host = RecordingAssetHost::new();
    let mut sink = RecordingTextureUploadSink::default();
    let sync = NativeTextureUploadSyncPlan {
        resident_resource_ids: vec![ResourceId::from("images:ready.png")],
        ..Default::default()
    };

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(report.is_ok());
    assert_eq!(report.pending_request_count, 0);
    assert_eq!(report.already_resident_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(sink.uploads.is_empty());
}

#[test]
fn releases_orphaned_resident_textures_without_host_reads() {
    let host = RecordingAssetHost::new();
    let mut sink = TextureResidentBackend {
        resident_resource_ids: vec!["images:old.png".to_string()],
        ..Default::default()
    };
    let sync = NativeTextureUploadSyncPlan {
        orphaned_resident_resource_ids: vec![ResourceId::from("images:old.png")],
        ..Default::default()
    };

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(report.is_ok());
    assert_eq!(report.orphaned_resident_count, 1);
    assert_eq!(report.released_orphaned_count, 1);
    assert_eq!(
        report.released_orphaned_resource_ids,
        vec![ResourceId::from("images:old.png")]
    );
    assert!(sink.resident_resource_ids.is_empty());
    assert_eq!(
        sink.released_resource_ids,
        vec![ResourceId::from("images:old.png")]
    );
    assert!(host.reads.borrow().is_empty());
    assert!(sink.uploads.is_empty());
}

#[test]
fn records_orphan_release_failures_in_sync_report() {
    let host = RecordingAssetHost::new();
    let mut sink = TextureResidentBackend {
        resident_resource_ids: vec!["images:old.png".to_string()],
        fail_release: true,
        ..Default::default()
    };
    let sync = NativeTextureUploadSyncPlan {
        orphaned_resident_resource_ids: vec![ResourceId::from("images:old.png")],
        ..Default::default()
    };

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(!report.is_ok());
    assert_eq!(report.orphaned_resident_count, 1);
    assert_eq!(report.released_orphaned_count, 0);
    assert_eq!(report.release_error_count, 1);
    assert_eq!(
        report.release_failures[0].resource_id,
        ResourceId::from("images:old.png")
    );
    assert!(report.release_failures[0]
        .message
        .contains("release failed"));
    assert_eq!(sink.resident_resource_ids, vec!["images:old.png"]);
    assert!(host.reads.borrow().is_empty());
}
