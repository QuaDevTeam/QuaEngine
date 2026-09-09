use super::super::fixtures::textured_background_view;
use super::*;

use crate::projection::view::ViewProjection;
use crate::renderer::{NativeRenderer, NativeRendererHostCleanupRecord};
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

#[test]
fn real_noop_backend_releases_decoded_textures_from_host_cleanup_records() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(900.0),
            ..Default::default()
        },
    );
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:bg/school.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();
    renderer
        .prepare_and_render(layout, &textured_background_view("bg/school.png"))
        .unwrap();

    let update = renderer.prepare_frame(layout, &ViewProjection::default());

    assert_eq!(renderer.backend().decoded_texture_resource_count(), 1);
    assert_eq!(
        update
            .host_cleanup
            .iter()
            .map(|record| record.resource_id.clone())
            .collect::<Vec<_>>(),
        vec![ResourceId::from("images:bg/school.png")]
    );

    let cleanup = renderer
        .backend_mut()
        .release_decoded_textures_for_frame_update(&update);

    assert_eq!(
        cleanup.released_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(cleanup.missing_resource_ids.is_empty());
    assert!(cleanup.ignored_resource_ids.is_empty());
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);

    let cleanup_again = renderer
        .backend_mut()
        .release_decoded_textures_for_frame_update(&update);

    assert!(cleanup_again.released_resource_ids.is_empty());
    assert_eq!(
        cleanup_again.missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(cleanup_again.ignored_resource_ids.is_empty());
}

#[test]
fn repeated_scene_textures_return_to_zero_after_frame_cleanup() {
    let device =
        RealWgpuNativeRenderRuntimeDevice::new(RealWgpuNativeRenderRuntimeTarget::noop(320, 180));
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    let layout = resolve_stage_layout(
        None,
        StageContainerInput {
            width: Some(320.0),
            height: Some(180.0),
            ..Default::default()
        },
    );
    for index in 0..128 {
        let asset = format!("bg/scene-{index}.png");
        renderer
            .backend_mut()
            .upload_decoded_texture_rgba8(
                format!("images:{asset}"),
                RealWgpuDecodedTextureRgba8::new(2, 2, vec![255; 16]),
            )
            .unwrap();
        renderer
            .prepare_and_render(layout, &textured_background_view(&asset))
            .unwrap();
        assert_eq!(renderer.backend().decoded_texture_resource_count(), 1);
        let update = renderer.prepare_frame(layout, &ViewProjection::default());
        let cleanup = renderer
            .backend_mut()
            .release_decoded_textures_for_frame_update(&update);
        assert_eq!(cleanup.released_resource_ids.len(), 1);
        renderer.submit_latest_frame().unwrap();
        assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);
    }
}

#[test]
fn real_noop_backend_reports_mixed_host_cleanup_records() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:bg/live.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();

    let cleanup = renderer
        .backend_mut()
        .release_decoded_textures_for_host_cleanup(&[
            cleanup_record("images:bg/live.png", NativeResourceKind::Texture),
            cleanup_record("images:bg/missing.png", NativeResourceKind::DecodedImage),
            cleanup_record("ui:compiled-menu.qui", NativeResourceKind::UiAst),
        ]);

    assert_eq!(
        cleanup.released_resource_ids,
        vec![ResourceId::from("images:bg/live.png")]
    );
    assert_eq!(
        cleanup.missing_resource_ids,
        vec![ResourceId::from("images:bg/missing.png")]
    );
    assert_eq!(
        cleanup.ignored_resource_ids,
        vec![ResourceId::from("ui:compiled-menu.qui")]
    );
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);
}

#[test]
fn real_noop_backend_releases_decoded_textures_from_package_release_records() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:bg/package.png", NativeResourceKind::Texture)
            .owned_by("runtime.bg"),
    );
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:bg/package.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![64, 128, 192, 255]),
        )
        .unwrap();

    let package_release = renderer.release_package_resources("runtime.bg");

    assert!(package_release.plan.can_unload());
    assert_eq!(
        package_release
            .host_cleanup
            .iter()
            .map(|record| record.resource_id.clone())
            .collect::<Vec<_>>(),
        vec![ResourceId::from("images:bg/package.png")]
    );

    let cleanup = renderer
        .backend_mut()
        .release_decoded_textures_for_package_release(&package_release);

    assert_eq!(
        cleanup.released_resource_ids,
        vec![ResourceId::from("images:bg/package.png")]
    );
    assert!(cleanup.missing_resource_ids.is_empty());
    assert!(cleanup.ignored_resource_ids.is_empty());
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);
}

#[test]
fn real_noop_backend_releases_metadata_only_decoded_textures_from_package_release() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8_with_metadata(
            "images:bg/dependent.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![64, 128, 192, 255]),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.bg")
                .require_package("base"),
        )
        .unwrap();

    let package_release = renderer.release_package_resources("base");

    assert!(package_release.plan.can_unload());
    assert!(package_release.host_cleanup.is_empty());
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 1);

    let cleanup = renderer
        .backend_mut()
        .release_decoded_textures_for_package_release(&package_release);

    assert_eq!(
        cleanup.released_resource_ids,
        vec![ResourceId::from("images:bg/dependent.png")]
    );
    assert!(cleanup.missing_resource_ids.is_empty());
    assert!(cleanup.ignored_resource_ids.is_empty());
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);
}

#[test]
fn real_noop_backend_keeps_metadata_only_decoded_textures_when_package_release_is_blocked() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:bg/foreign.png", NativeResourceKind::Texture)
            .owned_by("runtime.foreign")
            .require_package("base"),
    );
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8_with_metadata(
            "images:bg/dependent.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![64, 128, 192, 255]),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.bg")
                .require_package("base"),
        )
        .unwrap();

    let package_release = renderer.release_package_resources("base");

    assert!(!package_release.plan.can_unload());
    assert!(package_release.host_cleanup.is_empty());

    let cleanup = renderer
        .backend_mut()
        .release_decoded_textures_for_package_release(&package_release);

    assert!(cleanup.is_empty());
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 1);
}

fn cleanup_record(
    resource_id: impl Into<ResourceId>,
    kind: NativeResourceKind,
) -> NativeRendererHostCleanupRecord {
    NativeRendererHostCleanupRecord {
        resource_id: resource_id.into(),
        kind,
        declarative_asset: false,
        owner_package_id: None,
        required_package_ids: Vec::new(),
        memory: Default::default(),
        label: None,
    }
}
