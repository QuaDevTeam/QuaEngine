use quajs_wgpu_renderer::renderer::NativeRenderer;
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use crate::texture_sync::render_frame_with_host_texture_sync;

use super::super::support::{
    bundle, test_layout, view_with_background, RecordingAssetHost, TextureResidentBackend,
};

#[test]
fn render_frame_helper_uploads_pending_textures_and_resubmits_prepared_frame() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let result = render_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        test_layout(),
        &view_with_background(),
    )
    .expect("texture-synced frame should render");

    assert!(result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.uploaded_count, 1);
    assert!(result.frame.texture_upload_sync.pending_requests.is_empty());
    assert_eq!(
        result.frame.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
    assert_eq!(renderer.backend().uploads[0].bytes, vec![1, 2, 3, 4]);
    assert_eq!(
        renderer.backend().uploads[0]
            .metadata
            .owner_package_id
            .as_deref(),
        Some("base")
    );
}

#[test]
fn render_frame_helper_does_not_resubmit_when_texture_upload_fails() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        fail_upload: true,
        ..Default::default()
    });

    let result = render_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        test_layout(),
        &view_with_background(),
    )
    .expect("initial frame still renders when upload fails");

    assert!(!result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.upload_error_count, 1);
    assert_eq!(result.frame.texture_upload_sync.pending_requests.len(), 1);
    assert_eq!(renderer.backend().submissions.len(), 1);
    assert!(renderer.backend().uploads.is_empty());
}

#[test]
fn render_frame_helper_does_not_reread_or_resubmit_resident_textures() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:bg/school.png".to_string()],
        ..Default::default()
    });

    let result = render_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        test_layout(),
        &view_with_background(),
    )
    .expect("resident texture frame should render");

    assert!(!result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.pending_request_count, 0);
    assert_eq!(result.texture_upload_report.already_resident_count, 1);
    assert_eq!(
        result.frame.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(renderer.backend().submissions.len(), 1);
    assert!(renderer.backend().uploads.is_empty());
    assert!(host.reads.borrow().is_empty());
}

#[test]
fn render_frame_helper_refreshes_texture_sync_after_orphan_release_without_resubmit() {
    let host = RecordingAssetHost::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:old.png".to_string()],
        ..Default::default()
    });

    let result = render_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        test_layout(),
        &Default::default(),
    )
    .expect("empty frame should render and release orphaned textures");

    assert!(!result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.uploaded_count, 0);
    assert_eq!(result.texture_upload_report.orphaned_resident_count, 1);
    assert_eq!(result.texture_upload_report.released_orphaned_count, 1);
    assert!(result.frame.texture_upload_sync.pending_requests.is_empty());
    assert!(result
        .frame
        .texture_upload_sync
        .orphaned_resident_resource_ids
        .is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
    assert_eq!(renderer.backend().submissions.len(), 1);
    assert!(host.reads.borrow().is_empty());
}

#[test]
fn render_frame_helper_releases_frame_host_cleanup_before_texture_sync() {
    let host = RecordingAssetHost::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:old.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:old.png", NativeResourceKind::Texture).owned_by("base"),
    );

    let result = render_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        test_layout(),
        &Default::default(),
    )
    .expect("empty frame should release stale frame resources through host cleanup");

    assert!(!result.resubmitted_after_texture_upload);
    assert_eq!(result.frame.update.host_cleanup.len(), 1);
    assert_eq!(result.texture_host_cleanup_report.released_count, 1);
    assert_eq!(
        result.texture_host_cleanup_report.released_resource_ids,
        vec![ResourceId::from("images:old.png")]
    );
    assert_eq!(result.texture_upload_report.orphaned_resident_count, 0);
    assert!(result
        .frame
        .texture_upload_sync
        .orphaned_resident_resource_ids
        .is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
    assert!(host.reads.borrow().is_empty());
}
