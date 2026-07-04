use quajs_wgpu_renderer::renderer::NativeRenderer;
use quajs_wgpu_renderer::resources::ResourceId;

use crate::texture_sync::{
    render_json_frame_with_host_texture_lifecycle_sync,
    render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    render_json_frame_with_host_texture_sync, NativeTextureBundleMountRegistry,
};

use super::super::support::{bundle, RecordingAssetHost, TextureResidentBackend};

#[test]
fn render_json_frame_helper_uploads_pending_textures_and_resubmits() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let result = render_json_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "bg/school.png",
              "provenance": { "contentPackageId": "base" }
            }
          }
        }"#,
    )
    .expect("texture-synced JSON frame should render");

    assert!(result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.uploaded_count, 1);
    assert!(result.frame.texture_upload_sync.pending_requests.is_empty());
    assert_eq!(
        result.frame.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
}

#[test]
fn render_json_lifecycle_frame_helper_syncs_texture_upload_and_bundle_baseline() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let result = render_json_frame_with_host_texture_lifecycle_sync(
        &mut registry,
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "bg/school.png",
              "provenance": { "contentPackageId": "base" }
            }
          }
        }"#,
    )
    .expect("texture lifecycle JSON frame should render");

    assert!(result.frame.resubmitted_after_texture_upload);
    assert_eq!(result.frame.texture_upload_report.uploaded_count, 1);
    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
    assert!(result.bundle_lifecycle_report.initial_sync);
    assert_eq!(result.bundle_lifecycle_report.observed_bundle_count, 1);
    assert_eq!(
        result.bundle_lifecycle_report.current_package_ids,
        vec!["base"]
    );
    assert_eq!(
        result.bundle_lifecycle_report.tracked_package_ids,
        vec!["base"]
    );
    assert_eq!(result.bundle_lifecycle_report.release_attempt_count, 0);
    assert_eq!(registry.tracked_package_ids(), vec!["base"]);
}

#[test]
fn render_json_lifecycle_audio_teardown_helper_syncs_texture_upload_and_bundle_baseline() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "bg/school.png", [1, 2, 3, 4]);
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::with_null_audio_backend(TextureResidentBackend::default());

    let result = render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
        &mut registry,
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "bg/school.png",
              "provenance": { "contentPackageId": "base" }
            }
          }
        }"#,
    )
    .expect("texture lifecycle JSON frame should render with audio teardown gate");

    assert!(result.frame.resubmitted_after_texture_upload);
    assert_eq!(result.frame.texture_upload_report.uploaded_count, 1);
    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
    assert!(result.bundle_lifecycle_report.initial_sync);
    assert_eq!(
        result.bundle_lifecycle_report.tracked_package_ids,
        vec!["base"]
    );
    assert_eq!(registry.tracked_package_ids(), vec!["base"]);
}

#[test]
fn render_json_frame_helper_validates_frame_before_host_reads() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "../native.dylib", [1, 2, 3, 4]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let error = render_json_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "../native.dylib",
              "provenance": { "contentPackageId": "base" }
            }
          }
        }"#,
    )
    .expect_err("unsafe JSON frame should fail before texture sync");

    assert!(error
        .to_string()
        .contains("Invalid native renderer frame JSON"));
    assert!(host.reads.borrow().is_empty());
    assert!(renderer.backend().submissions.is_empty());
    assert!(renderer.backend().uploads.is_empty());
}

#[test]
fn render_json_lifecycle_frame_helper_validates_frame_before_host_reads() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(Some("base-bundle"), "../native.dylib", [1, 2, 3, 4]);
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let error = render_json_frame_with_host_texture_lifecycle_sync(
        &mut registry,
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "../native.dylib",
              "provenance": { "contentPackageId": "base" }
            }
          }
        }"#,
    )
    .expect_err("unsafe lifecycle JSON frame should fail before texture sync");

    assert!(error
        .to_string()
        .contains("Invalid native renderer frame JSON"));
    assert!(host.reads.borrow().is_empty());
    assert!(renderer.backend().submissions.is_empty());
    assert!(renderer.backend().uploads.is_empty());
    assert!(!registry.is_initialized());
}
