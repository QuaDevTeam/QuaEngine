use quajs_native_runtime::NativeHostApiError;
use quajs_wgpu_renderer::resources::ResourceId;

use crate::texture_sync::{
    sync_pending_texture_uploads_from_host, NativeTextureUploadHostSyncFailureKind,
};

use super::super::support::{
    self, bundle, sync_plan, texture_request, RecordingAssetHost, RecordingTextureUploadSink,
};

#[test]
fn uploads_pending_texture_from_owner_package_bundle_with_metadata() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")))
        .with_asset(Some("runtime-menu-bundle"), "ui/panel.png", [1, 2, 3, 4]);
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:ui/panel.png",
        "images",
        "ui/panel.png",
        ["runtime.menu"],
        ["base"],
        ["base", "runtime.menu"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(report.is_ok());
    assert_eq!(report.pending_request_count, 1);
    assert_eq!(report.uploaded_count, 1);
    assert_eq!(
        report.uploaded_resource_ids,
        vec![ResourceId::from("images:ui/panel.png")]
    );
    assert_eq!(host.reads.borrow().len(), 1);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-menu-bundle")
    );
    let upload = &sink.uploads[0];
    assert_eq!(upload.resource_id, ResourceId::from("images:ui/panel.png"));
    assert_eq!(upload.bytes, vec![1, 2, 3, 4]);
    assert_eq!(
        upload.metadata.owner_package_id.as_deref(),
        Some("runtime.menu")
    );
    assert_eq!(upload.metadata.required_package_ids, support::set(["base"]));
}

#[test]
fn loads_texture_from_quack_qpk_asset_path_after_logical_name_misses() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(
            Some("base-bundle"),
            "assets/images/ui/panel.png",
            [1, 2, 3, 4],
        );
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:ui/panel.png",
        "images",
        "ui/panel.png",
        ["base"],
        [],
        ["base"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(report.is_ok());
    assert_eq!(report.uploaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(host.reads.borrow()[0].url, "ui/panel.png");
    assert_eq!(host.reads.borrow()[1].url, "assets/images/ui/panel.png");
}

#[test]
fn falls_back_to_required_package_bundle_without_losing_projection_package() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")))
        .with_asset(Some("base-bundle"), "ui/panel.png", [9, 8, 7]);
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:ui/panel.png",
        "images",
        "ui/panel.png",
        ["runtime.menu"],
        ["base"],
        ["base", "runtime.menu"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(report.is_ok());
    assert_eq!(report.uploaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-menu-bundle")
    );
    assert_eq!(
        host.reads.borrow()[1].bundle_name.as_deref(),
        Some("base-bundle")
    );
    let upload = &sink.uploads[0];
    assert_eq!(upload.metadata.owner_package_id.as_deref(), Some("base"));
    assert_eq!(
        upload.metadata.required_package_ids,
        support::set(["runtime.menu"])
    );
}

#[test]
fn stops_candidate_fallback_when_host_read_errors() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")))
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_read_error(
            Some("runtime-menu-bundle"),
            "ui/panel.png",
            NativeHostApiError::InvalidRequest("transient host read failure".to_string()),
        )
        .with_asset(Some("base-bundle"), "ui/panel.png", [9, 8, 7]);
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:ui/panel.png",
        "images",
        "ui/panel.png",
        ["runtime.menu"],
        ["base"],
        ["base", "runtime.menu"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(!report.is_ok());
    assert_eq!(report.host_error_count, 1);
    assert_eq!(report.missing_asset_count, 0);
    assert_eq!(report.uploaded_count, 0);
    assert!(sink.uploads.is_empty());
    assert_eq!(host.reads.borrow().len(), 1);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-menu-bundle")
    );
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeTextureUploadHostSyncFailureKind::HostError
    );
    assert_eq!(failure.bundle_name.as_deref(), Some("runtime-menu-bundle"));
    assert_eq!(failure.package_id.as_deref(), Some("runtime.menu"));
    assert!(failure.message.contains("transient host read failure"));
}
