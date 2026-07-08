use quajs_wgpu_renderer::audio::NullNativeAudioBackend;
use quajs_wgpu_renderer::renderer::NativeRenderer;
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use crate::texture_sync::{
    render_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    render_frame_with_host_texture_sync, NativeTextureBundleMountRegistry,
};

use super::super::support::{
    bundle, test_layout, view_with_audio_package, view_with_background, AssetLoadingAudioBackend,
    RecordingAssetHost, TextureResidentBackend,
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

#[test]
fn audio_asset_loading_backend_reads_package_assets_before_audio_commands() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("runtime-bundle", Some("runtime.menu")))
        .with_asset(Some("runtime-bundle"), "music/opening.ogg", [5, 6, 7, 8]);
    let mut renderer = NativeRenderer::with_audio_backend(
        TextureResidentBackend::default(),
        AssetLoadingAudioBackend::default(),
    );
    let mut registry = NativeTextureBundleMountRegistry::new();

    let result = render_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
        &mut registry,
        &mut renderer,
        &host,
        test_layout(),
        &view_with_audio_package("runtime.menu"),
    )
    .expect("audio asset loading frame should render");

    let report = result
        .frame
        .audio_asset_report
        .expect("asset-loading backend should request audio assets");
    assert_eq!(report.loaded_count, 1);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("runtime-bundle")
    );
    assert_eq!(
        host.reads.borrow()[0].asset_id.as_deref(),
        Some("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    let audio_backend = renderer.audio_backend().unwrap();
    assert_eq!(audio_backend.events, vec!["loads", "commands"]);
    assert_eq!(audio_backend.loads.len(), 1);
    assert_eq!(audio_backend.loads[0].bytes, vec![5, 6, 7, 8]);
    assert_eq!(
        audio_backend.loads[0].package_id.as_deref(),
        Some("runtime.menu")
    );
    assert_eq!(audio_backend.plans.len(), 1);
}

#[test]
fn null_audio_backend_does_not_read_audio_assets() {
    let host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-bundle", Some("runtime.menu")));
    let mut renderer = NativeRenderer::with_audio_backend(
        TextureResidentBackend::default(),
        NullNativeAudioBackend::new(),
    );
    let mut registry = NativeTextureBundleMountRegistry::new();

    let result = render_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
        &mut registry,
        &mut renderer,
        &host,
        test_layout(),
        &view_with_audio_package("runtime.menu"),
    )
    .expect("null backend should not require audio asset bytes");

    assert!(result.frame.audio_asset_report.is_none());
    assert!(host.reads.borrow().is_empty());
    assert_eq!(
        renderer
            .audio_backend()
            .unwrap()
            .diagnostics()
            .active_track_count,
        1
    );
}

#[test]
fn missing_audio_asset_rolls_back_renderer_audio_state_for_asset_loading_backend() {
    let host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-bundle", Some("runtime.menu")));
    let mut renderer = NativeRenderer::with_audio_backend(
        TextureResidentBackend::default(),
        AssetLoadingAudioBackend::default(),
    );
    let mut registry = NativeTextureBundleMountRegistry::new();

    let error = render_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
        &mut registry,
        &mut renderer,
        &host,
        test_layout(),
        &view_with_audio_package("runtime.menu"),
    )
    .expect_err("missing audio bytes should fail before backend commands are applied");

    assert!(error.to_string().contains("Native audio asset sync failed"));
    assert!(renderer.state().audio_backend_tracks().is_empty());
    let audio_backend = renderer.audio_backend().unwrap();
    assert!(audio_backend.loads.is_empty());
    assert!(audio_backend.plans.is_empty());
    assert_eq!(host.reads.borrow().len(), 1);
}
