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
fn rejects_native_payload_texture_assets_before_host_reads() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));

    for asset_name in ["ui/helper.class", "native/Plugin.framework/Contents/bin"] {
        let mut sink = RecordingTextureUploadSink::default();
        let sync = sync_plan([texture_request(
            "images:ui/helper.png",
            "images",
            asset_name,
            ["base"],
            [],
            ["base"],
        )]);

        let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

        assert!(
            !report.is_ok(),
            "native payload texture asset should fail before host reads: {asset_name:?}"
        );
        assert_eq!(report.invalid_request_count, 1);
        assert!(report.failures[0]
            .message
            .contains("must not reference native payloads"));
        assert!(sink.uploads.is_empty());
    }
    assert!(host.reads.borrow().is_empty());
}

#[test]
fn rejects_asset_names_with_whitespace_or_control_characters_before_host_reads() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));

    for asset_name in [" ui/panel.png", "ui/panel.png ", "ui/\u{1b}panel.png"] {
        let mut sink = RecordingTextureUploadSink::default();
        let sync = sync_plan([texture_request(
            "images:ui/panel.png",
            "images",
            asset_name,
            ["base"],
            [],
            ["base"],
        )]);

        let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

        assert!(
            !report.is_ok(),
            "unsafe asset name should fail before host reads: {asset_name:?}"
        );
        assert_eq!(report.invalid_request_count, 1);
        assert!(report.failures[0]
            .message
            .contains("control characters or surrounding whitespace"));
        assert!(sink.uploads.is_empty());
    }

    assert!(host.reads.borrow().is_empty());
}

#[test]
fn rejects_unsafe_asset_types_before_host_reads() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));

    for asset_type in [".", "-images", "images.raw", " images"] {
        let mut sink = RecordingTextureUploadSink::default();
        let sync = sync_plan([texture_request(
            "images:ui/panel.png",
            asset_type,
            "ui/panel.png",
            ["base"],
            [],
            ["base"],
        )]);

        let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

        assert!(
            !report.is_ok(),
            "unsafe asset type should fail: {asset_type:?}"
        );
        assert_eq!(report.invalid_request_count, 1);
        assert!(report.failures[0]
            .message
            .contains("Invalid native texture asset type"));
        assert!(sink.uploads.is_empty());
    }

    assert!(host.reads.borrow().is_empty());
}

#[test]
fn rejects_unsafe_package_ids_before_host_reads() {
    let host = RecordingAssetHost::new().with_bundle(bundle("base-bundle", Some("base")));
    let cases = [
        (
            "owner",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["runtime..menu"],
                [],
                ["base"],
            ),
        ),
        (
            "required",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["runtime.menu"],
                ["base..shared"],
                ["base"],
            ),
        ),
        (
            "candidate",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["runtime.menu"],
                [],
                ["base..candidate"],
            ),
        ),
        (
            "dot-only owner",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["."],
                [],
                ["base"],
            ),
        ),
        (
            "dot-prefixed required",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["runtime.menu"],
                [".base"],
                ["base"],
            ),
        ),
        (
            "dot-suffixed candidate",
            texture_request(
                "images:ui/panel.png",
                "images",
                "ui/panel.png",
                ["runtime.menu"],
                [],
                ["base."],
            ),
        ),
    ];

    for (source, request) in cases {
        let mut sink = RecordingTextureUploadSink::default();
        let sync = sync_plan([request]);

        let report = sync_pending_texture_uploads_from_host(&host, &mut sink, &sync);

        assert!(
            !report.is_ok(),
            "unsafe {source} package id should fail before host reads"
        );
        assert_eq!(report.invalid_request_count, 1);
        assert!(report.failures[0]
            .message
            .contains("Invalid native texture package id"));
        assert!(sink.uploads.is_empty());
    }

    assert!(host.reads.borrow().is_empty());
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
    assert_eq!(host.reads.borrow().len(), 4);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-menu-bundle")
    );
    assert_eq!(
        host.reads.borrow()[1].bundle_name.as_deref(),
        Some("base-bundle")
    );
    assert_eq!(host.reads.borrow()[2].url, "assets/images/ui/panel.png");
    assert!(sink.uploads.is_empty());
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeTextureUploadHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.bundle_name.as_deref(), Some("base-bundle"));
    assert_eq!(failure.package_id.as_deref(), Some("base"));
}
