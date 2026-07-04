use std::collections::BTreeSet;

use quajs_wgpu_renderer::projection::background::BackgroundProjection;
use quajs_wgpu_renderer::projection::common::PackageProvenance;
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::renderer::NativeRenderer;
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use crate::texture_sync::{
    render_frame_with_host_texture_lifecycle_sync, sync_mounted_texture_bundle_lifecycle_from_host,
    NativeTextureBundleMountRegistry,
};

use super::support::{bundle, test_layout, RecordingAssetHost, TextureResidentBackend};

#[test]
fn initial_sync_tracks_bundles_without_releasing_resources() {
    let host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")));
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu"),
    );

    let report =
        sync_mounted_texture_bundle_lifecycle_from_host(&mut registry, &mut renderer, &host)
            .expect("mounted bundle baseline should sync");

    assert!(report.initial_sync);
    assert_eq!(report.observed_bundle_count, 1);
    assert_eq!(report.current_package_ids, vec!["runtime.menu"]);
    assert_eq!(report.added_package_ids, vec!["runtime.menu"]);
    assert!(report.removed_package_ids.is_empty());
    assert_eq!(report.tracked_package_ids, vec!["runtime.menu"]);
    assert_eq!(registry.tracked_package_ids(), vec!["runtime.menu"]);
    assert_eq!(report.release_attempt_count, 0);
    assert!(renderer
        .resources()
        .get(ResourceId::from("images:runtime-menu.png"))
        .is_some());
    assert_eq!(
        renderer.backend().resident_resource_ids,
        vec!["images:runtime-menu.png"]
    );
}

#[test]
fn releases_unmounted_package_textures() {
    let mounted_host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")));
    let unmounted_host = RecordingAssetHost::new();
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu"),
    );

    sync_mounted_texture_bundle_lifecycle_from_host(&mut registry, &mut renderer, &mounted_host)
        .expect("initial mounted bundle baseline should sync");

    let report = sync_mounted_texture_bundle_lifecycle_from_host(
        &mut registry,
        &mut renderer,
        &unmounted_host,
    )
    .expect("unmounted package should release renderer texture resources");

    assert!(!report.initial_sync);
    assert_eq!(report.removed_package_ids, vec!["runtime.menu"]);
    assert_eq!(report.released_package_ids, vec!["runtime.menu"]);
    assert!(report.blocked_package_ids.is_empty());
    assert!(report.retained_blocked_package_ids.is_empty());
    assert!(report.tracked_package_ids.is_empty());
    assert_eq!(registry.tracked_package_ids(), Vec::<String>::new());
    assert_eq!(report.release_attempt_count, 1);
    assert_eq!(report.released_resource_count, 1);
    assert_eq!(report.texture_cleanup_error_count, 0);
    assert_eq!(report.package_releases.len(), 1);
    assert_eq!(
        report.package_releases[0]
            .texture_cleanup_report
            .released_resource_ids,
        vec![ResourceId::from("images:runtime-menu.png")]
    );
    assert!(renderer.resources().is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
}

#[test]
fn retains_blocked_unmounted_packages_for_retry() {
    let mounted_host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")));
    let unmounted_host = RecordingAssetHost::new();
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:blocked-menu.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:blocked-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu")
            .require_package("base"),
    );

    sync_mounted_texture_bundle_lifecycle_from_host(&mut registry, &mut renderer, &mounted_host)
        .expect("initial mounted bundle baseline should sync");

    let first = sync_mounted_texture_bundle_lifecycle_from_host(
        &mut registry,
        &mut renderer,
        &unmounted_host,
    )
    .expect("blocked unmounted package should be retained");
    let retry = sync_mounted_texture_bundle_lifecycle_from_host(
        &mut registry,
        &mut renderer,
        &unmounted_host,
    )
    .expect("retained blocked package should be retried on later lifecycle sync");

    assert_eq!(first.removed_package_ids, vec!["runtime.menu"]);
    assert_eq!(first.blocked_package_ids, vec!["runtime.menu"]);
    assert_eq!(first.retained_blocked_package_ids, vec!["runtime.menu"]);
    assert_eq!(first.tracked_package_ids, vec!["runtime.menu"]);
    assert!(first.released_package_ids.is_empty());
    assert_eq!(first.release_attempt_count, 1);
    assert_eq!(first.released_resource_count, 0);
    assert_eq!(retry.removed_package_ids, vec!["runtime.menu"]);
    assert_eq!(retry.blocked_package_ids, vec!["runtime.menu"]);
    assert_eq!(retry.release_attempt_count, 1);
    assert_eq!(registry.tracked_package_ids(), vec!["runtime.menu"]);
    assert!(renderer
        .resources()
        .get(ResourceId::from("images:blocked-menu.png"))
        .is_some());
    assert_eq!(
        renderer.backend().resident_resource_ids,
        vec!["images:blocked-menu.png"]
    );
}

#[test]
fn frame_lifecycle_sync_releases_unmounted_package_after_projection_update() {
    let mounted_host =
        RecordingAssetHost::new().with_bundle(bundle("runtime-menu-bundle", Some("runtime.menu")));
    let unmounted_host = RecordingAssetHost::new();
    let mut registry = NativeTextureBundleMountRegistry::new();
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec![
            "images:ui/panel.png".to_string(),
            "images:runtime-extra.png".to_string(),
        ],
        ..Default::default()
    });

    renderer.prepare_frame(test_layout(), &view_with_runtime_background());
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:runtime-extra.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu"),
    );
    sync_mounted_texture_bundle_lifecycle_from_host(&mut registry, &mut renderer, &mounted_host)
        .expect("initial mounted bundle baseline should sync");

    let result = render_frame_with_host_texture_lifecycle_sync(
        &mut registry,
        &mut renderer,
        &unmounted_host,
        test_layout(),
        &ViewProjection::default(),
    )
    .expect("frame lifecycle sync should render and release unmounted package textures");

    assert!(!result.frame.resubmitted_after_texture_upload);
    assert_eq!(
        result
            .frame
            .texture_host_cleanup_report
            .released_resource_ids,
        vec![
            ResourceId::from("images:runtime-extra.png"),
            ResourceId::from("images:ui/panel.png"),
        ]
    );
    assert_eq!(
        result.bundle_lifecycle_report.removed_package_ids,
        vec!["runtime.menu"]
    );
    assert_eq!(
        result.bundle_lifecycle_report.released_package_ids,
        vec!["runtime.menu"]
    );
    assert_eq!(result.bundle_lifecycle_report.release_attempt_count, 1);
    assert_eq!(result.bundle_lifecycle_report.released_resource_count, 0);
    assert!(result.bundle_lifecycle_report.package_releases[0]
        .package_release
        .released_resources
        .is_empty());
    assert!(result
        .bundle_lifecycle_report
        .tracked_package_ids
        .is_empty());
    assert_eq!(registry.tracked_package_ids(), Vec::<String>::new());
    assert!(renderer.resources().is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
}

fn view_with_runtime_background() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("ui/panel.png".to_string()),
            provenance: PackageProvenance {
                content_package_id: Some("runtime.menu".to_string()),
                required_runtime_packages: BTreeSet::new(),
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}
