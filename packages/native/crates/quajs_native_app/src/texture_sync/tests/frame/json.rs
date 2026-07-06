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
fn render_json_frame_helper_uploads_scene_surface_images_from_required_package() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("runtime-ui-bundle", Some("runtime.ui")))
        .with_bundle(bundle("base-assets-bundle", Some("base.assets")))
        .with_asset(
            Some("base-assets-bundle"),
            "ui/shared/poster.png",
            [9, 8, 7, 6],
        );
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let result = render_json_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "ui": {
              "visible": true,
              "overlays": [
                {
                  "elementId": "gallery-scene",
                  "scene": {
                    "id": "gallery",
                    "surface": {
                      "key": "ui/gallery.qui",
                      "root": {
                        "id": "poster",
                        "kind": "Image",
                        "visible": true,
                        "bounds": { "x": 80, "y": 96, "width": 320, "height": 180 },
                        "image": {
                          "assetType": "images",
                          "assetName": "ui/shared/poster.png"
                        },
                        "provenance": {
                          "contentPackageId": "runtime.ui",
                          "requiredRuntimePackages": ["base.assets"]
                        }
                      }
                    }
                  }
                }
              ]
            }
          }
        }"#,
    )
    .expect("scene surface texture should resolve through package candidates");

    assert!(result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.uploaded_count, 1);
    assert_eq!(
        result.frame.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:ui/shared/poster.png")]
    );

    let reads = host.reads.borrow();
    assert_eq!(reads.len(), 2);
    assert_eq!(reads[0].bundle_name.as_deref(), Some("runtime-ui-bundle"));
    assert_eq!(reads[1].bundle_name.as_deref(), Some("base-assets-bundle"));
    assert!(reads.iter().all(|read| read.bundle_name.is_some()));
    assert!(reads.iter().all(|read| read.url == "ui/shared/poster.png"));
    assert!(reads
        .iter()
        .all(|read| read.asset_id.as_deref() == Some("images:ui/shared/poster.png")));
    drop(reads);

    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
    let upload = &renderer.backend().uploads[0];
    assert_eq!(
        upload.resource_id,
        ResourceId::from("images:ui/shared/poster.png")
    );
    assert_eq!(upload.bytes, vec![9, 8, 7, 6]);
    assert_eq!(
        upload.metadata.owner_package_id.as_deref(),
        Some("base.assets")
    );
    assert!(upload.metadata.required_package_ids.contains("runtime.ui"));
}

#[test]
fn render_json_frame_helper_uploads_scene_surface_background_images_from_required_package() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("runtime-ui-bundle", Some("runtime.ui")))
        .with_bundle(bundle("base-assets-bundle", Some("base.assets")))
        .with_asset(
            Some("base-assets-bundle"),
            "ui/shared/panel.png",
            [4, 7, 8, 9],
        );
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let result = render_json_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "ui": {
              "visible": true,
              "overlays": [
                {
                  "elementId": "settings-scene",
                  "scene": {
                    "id": "settings",
                    "surface": {
                      "key": "ui/settings.qui",
                      "root": {
                        "id": "settings-panel",
                        "kind": "Box",
                        "visible": true,
                        "bounds": { "x": 64, "y": 72, "width": 420, "height": 300 },
                        "style": {
                          "backgroundImage": {
                            "assetType": "images",
                            "assetName": "ui/shared/panel.png"
                          }
                        },
                        "provenance": {
                          "contentPackageId": "runtime.ui",
                          "requiredRuntimePackages": ["base.assets"]
                        }
                      }
                    }
                  }
                }
              ]
            }
          }
        }"#,
    )
    .expect("scene surface background texture should resolve through package candidates");

    assert!(result.resubmitted_after_texture_upload);
    assert_eq!(result.texture_upload_report.uploaded_count, 1);
    assert_eq!(
        result.frame.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:ui/shared/panel.png")]
    );

    let reads = host.reads.borrow();
    assert_eq!(reads.len(), 2);
    assert_eq!(reads[0].bundle_name.as_deref(), Some("runtime-ui-bundle"));
    assert_eq!(reads[1].bundle_name.as_deref(), Some("base-assets-bundle"));
    assert!(reads.iter().all(|read| read.bundle_name.is_some()));
    assert!(reads.iter().all(|read| read.url == "ui/shared/panel.png"));
    assert!(reads
        .iter()
        .all(|read| read.asset_id.as_deref() == Some("images:ui/shared/panel.png")));
    drop(reads);

    assert_eq!(renderer.backend().submissions.len(), 2);
    assert_eq!(renderer.backend().uploads.len(), 1);
    let upload = &renderer.backend().uploads[0];
    assert_eq!(
        upload.resource_id,
        ResourceId::from("images:ui/shared/panel.png")
    );
    assert_eq!(upload.bytes, vec![4, 7, 8, 9]);
    assert_eq!(
        upload.metadata.owner_package_id.as_deref(),
        Some("base.assets")
    );
    assert!(upload.metadata.required_package_ids.contains("runtime.ui"));
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
fn render_json_frame_helper_rejects_unsafe_video_poster_before_host_reads() {
    let host = RecordingAssetHost::new()
        .with_bundle(bundle("base-bundle", Some("base")))
        .with_asset(
            Some("base-bundle"),
            "../native/poster.node?raw",
            [1, 2, 3, 4],
        )
        .with_asset(Some("base-bundle"), "video/opening.webm", [5, 6, 7, 8]);
    let mut renderer = NativeRenderer::new(TextureResidentBackend::default());

    let error = render_json_frame_with_host_texture_sync(
        &mut renderer,
        &host,
        r#"{
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000 },
          "view": {
            "background": {
              "mode": "video",
              "video": {
                "assetName": "video/opening.webm",
                "poster": "../native/poster.node?raw",
                "provenance": { "contentPackageId": "base" }
              }
            }
          }
        }"#,
    )
    .expect_err("unsafe video poster JSON frame should fail before texture sync");

    let error_message = error.to_string();
    assert!(error_message.contains("Invalid native renderer frame JSON"));
    assert!(error_message.contains("view.background.video.poster"));
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
