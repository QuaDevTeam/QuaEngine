use crate::texture_sync::{
    sync_pending_texture_uploads_from_host, NativeTextureUploadHostSyncFailureKind,
};

use super::super::support::{
    bundle, sync_plan, texture_request, RecordingAssetHost, RecordingTextureUploadSink,
};

#[test]
fn rejects_unsafe_asset_references_before_host_reads() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:../native.dylib",
        "images",
        "../native.dylib",
        ["base"],
        [],
        ["base"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_request_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(sink.uploads.is_empty());
}

#[test]
fn reports_missing_assets_without_uploading() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:missing.png",
        "images",
        "missing.png",
        ["base"],
        [],
        ["base"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert!(sink.uploads.is_empty());
}

#[test]
fn package_scoped_requests_do_not_fall_back_to_unscoped_assets_without_matching_bundle() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(None, "ui/panel.png", [4, 3, 2, 1]);
    let mut sink = RecordingTextureUploadSink::default();
    let sync = sync_plan([texture_request(
        "images:ui/panel.png",
        "images",
        "ui/panel.png",
        ["runtime.menu"],
        [],
        ["runtime.menu"],
    )]);

    let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert!(report.failures[0]
        .message
        .contains("no mounted bundle matched package candidate"));
    assert!(host.reads.borrow().is_empty());
    assert!(sink.uploads.is_empty());
}

#[test]
fn reports_last_missing_bundle_candidate_when_all_package_reads_miss() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")))
        .with_bundle(bundle("base-bundle", Some("base")));
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
    assert_eq!(report.missing_asset_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-menu-bundle")
    );
    assert_eq!(
        host.reads.borrow()[1].bundle_name.as_deref(),
        Some("base-bundle")
    );
    assert!(sink.uploads.is_empty());
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeTextureUploadHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.bundle_name.as_deref(), Some("base-bundle"));
    assert_eq!(failure.package_id.as_deref(), Some("base"));
}
