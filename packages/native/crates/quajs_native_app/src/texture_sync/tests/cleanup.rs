use quajs_wgpu_renderer::audio::NativeAudioBackendError;
use quajs_wgpu_renderer::renderer::{NativeRenderer, NativeRendererHostCleanupRecord};
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use crate::texture_sync::{
    clear_renderer_with_host_texture_cleanup,
    clear_renderer_with_host_texture_cleanup_and_media_teardown,
    release_package_resources_with_host_texture_cleanup,
    release_package_resources_with_host_texture_cleanup_and_media_teardown,
    sync_texture_releases_from_host_cleanup, NativeTextureMediaTeardownError,
};

use super::support::{
    renderer_with_rejecting_audio_after_audio_frame,
    renderer_with_rejecting_audio_after_inactive_audio_frame, TextureResidentBackend,
};

#[test]
fn syncs_texture_releases_from_mixed_host_cleanup_records() {
    let mut sink = TextureResidentBackend {
        resident_resource_ids: vec!["images:bg/live.png".to_string()],
        ..Default::default()
    };
    let cleanup = vec![
        host_cleanup_record("images:bg/live.png", NativeResourceKind::Texture),
        host_cleanup_record("images:bg/missing.png", NativeResourceKind::DecodedImage),
        host_cleanup_record("ui:compiled-menu.qui", NativeResourceKind::UiAst),
    ];

    let report = sync_texture_releases_from_host_cleanup(&mut sink, &cleanup);

    assert!(report.is_ok());
    assert_eq!(report.cleanup_record_count, 3);
    assert_eq!(report.texture_release_candidate_count, 2);
    assert_eq!(report.released_count, 1);
    assert_eq!(report.missing_count, 1);
    assert_eq!(report.ignored_count, 1);
    assert_eq!(
        report.released_resource_ids,
        vec![ResourceId::from("images:bg/live.png")]
    );
    assert_eq!(
        report.missing_resource_ids,
        vec![ResourceId::from("images:bg/missing.png")]
    );
    assert_eq!(
        report.ignored_resource_ids,
        vec![ResourceId::from("ui:compiled-menu.qui")]
    );
    assert!(sink.resident_resource_ids.is_empty());
    assert_eq!(
        sink.released_resource_ids,
        vec![ResourceId::from("images:bg/live.png")]
    );
}

#[test]
fn records_texture_release_failures_from_host_cleanup() {
    let mut sink = TextureResidentBackend {
        resident_resource_ids: vec!["images:bg/live.png".to_string()],
        fail_release: true,
        ..Default::default()
    };
    let cleanup = vec![host_cleanup_record(
        "images:bg/live.png",
        NativeResourceKind::Texture,
    )];

    let report = sync_texture_releases_from_host_cleanup(&mut sink, &cleanup);

    assert!(!report.is_ok());
    assert_eq!(report.cleanup_record_count, 1);
    assert_eq!(report.texture_release_candidate_count, 1);
    assert_eq!(report.release_error_count, 1);
    assert_eq!(
        report.release_failures[0].resource_id,
        ResourceId::from("images:bg/live.png")
    );
    assert!(report.release_failures[0]
        .message
        .contains("release failed"));
    assert_eq!(sink.resident_resource_ids, vec!["images:bg/live.png"]);
    assert!(sink.released_resource_ids.is_empty());
}

#[test]
fn release_package_resources_with_host_texture_cleanup_releases_ledger_and_texture_handles() {
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("ui:compiled-menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("qss:menu.qss", NativeResourceKind::QssStyle)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("tokens:menu.json", NativeResourceKind::TokenTable)
            .owned_by("runtime.menu"),
    );

    let result = release_package_resources_with_host_texture_cleanup(&mut renderer, "runtime.menu");

    assert!(result.package_release.plan.can_unload());
    assert_eq!(result.package_release.released_resources.len(), 4);
    assert_eq!(result.package_release.host_cleanup.len(), 4);
    assert_eq!(result.texture_cleanup_report.cleanup_record_count, 4);
    assert_eq!(
        result
            .texture_cleanup_report
            .texture_release_candidate_count,
        1
    );
    assert_eq!(result.texture_cleanup_report.released_count, 1);
    assert_eq!(result.texture_cleanup_report.ignored_count, 3);
    assert_eq!(
        result.texture_cleanup_report.released_resource_ids,
        vec![ResourceId::from("images:runtime-menu.png")]
    );
    assert_eq!(
        result.texture_cleanup_report.ignored_resource_ids,
        vec![
            ResourceId::from("qss:menu.qss"),
            ResourceId::from("tokens:menu.json"),
            ResourceId::from("ui:compiled-menu.qui"),
        ]
    );
    assert!(renderer.resources().is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
}

#[test]
fn release_package_resources_with_host_texture_cleanup_respects_unload_blockers() {
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec!["images:blocked-menu.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:blocked-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu")
            .require_package("base"),
    );

    let result = release_package_resources_with_host_texture_cleanup(&mut renderer, "runtime.menu");

    assert!(!result.package_release.plan.can_unload());
    assert!(result.package_release.released_resources.is_empty());
    assert!(result.package_release.host_cleanup.is_empty());
    assert_eq!(result.texture_cleanup_report.cleanup_record_count, 0);
    assert_eq!(result.texture_cleanup_report.released_count, 0);
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
fn release_package_resources_with_host_texture_cleanup_audio_failure_preserves_handles() {
    let mut renderer = renderer_with_rejecting_audio_after_inactive_audio_frame(
        TextureResidentBackend {
            resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
            ..Default::default()
        },
        "runtime.menu",
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
            .owned_by("runtime.menu"),
    );

    let error = release_package_resources_with_host_texture_cleanup_and_media_teardown(
        &mut renderer,
        "runtime.menu",
    )
    .unwrap_err();

    assert_eq!(
        error,
        NativeTextureMediaTeardownError::Audio(NativeAudioBackendError::backend_rejected(
            "test audio backend rejected plan"
        ))
    );
    assert!(renderer
        .resources()
        .get(ResourceId::from("images:runtime-menu.png"))
        .is_some());
    assert!(renderer
        .resources()
        .get(ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"))
        .is_some());
    assert!(renderer
        .state()
        .audio_backend_tracks()
        .contains_key("bgm-main"));
    assert_eq!(
        renderer.backend().resident_resource_ids,
        vec!["images:runtime-menu.png"]
    );
    assert!(renderer.backend().released_resource_ids.is_empty());
}

#[test]
fn clear_renderer_with_host_texture_cleanup_releases_texture_handles() {
    let mut renderer = NativeRenderer::new(TextureResidentBackend {
        resident_resource_ids: vec![
            "images:bg.png".to_string(),
            "decoded:ui/panel.png".to_string(),
        ],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture).owned_by("base"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("decoded:ui/panel.png", NativeResourceKind::DecodedImage)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("styles:menu.qss", NativeResourceKind::QssStyle)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("surface:menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.menu"),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("tokens:menu.json", NativeResourceKind::TokenTable)
            .owned_by("runtime.menu"),
    );

    let result = clear_renderer_with_host_texture_cleanup(&mut renderer);

    assert_eq!(result.released_resources.len(), 5);
    assert_eq!(result.host_cleanup.len(), 5);
    assert_eq!(result.texture_cleanup_report.cleanup_record_count, 5);
    assert_eq!(
        result
            .texture_cleanup_report
            .texture_release_candidate_count,
        2
    );
    assert_eq!(result.texture_cleanup_report.released_count, 2);
    assert_eq!(result.texture_cleanup_report.ignored_count, 3);
    assert_eq!(
        result.texture_cleanup_report.released_resource_ids,
        vec![
            ResourceId::from("decoded:ui/panel.png"),
            ResourceId::from("images:bg.png"),
        ]
    );
    assert_eq!(
        result.texture_cleanup_report.ignored_resource_ids,
        vec![
            ResourceId::from("styles:menu.qss"),
            ResourceId::from("surface:menu.qui"),
            ResourceId::from("tokens:menu.json"),
        ]
    );
    assert!(renderer.resources().is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
}

#[test]
fn clear_renderer_with_host_texture_cleanup_audio_failure_preserves_handles() {
    let mut renderer = renderer_with_rejecting_audio_after_audio_frame(
        TextureResidentBackend {
            resident_resource_ids: vec!["images:bg.png".to_string()],
            ..Default::default()
        },
        "runtime.audio",
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture).owned_by("base"),
    );

    let error = clear_renderer_with_host_texture_cleanup_and_media_teardown(&mut renderer)
        .expect_err("media teardown failure should stop host texture cleanup");

    assert_eq!(
        error,
        NativeTextureMediaTeardownError::Audio(NativeAudioBackendError::backend_rejected(
            "test audio backend rejected plan"
        ))
    );
    assert!(renderer
        .resources()
        .get(ResourceId::from("images:bg.png"))
        .is_some());
    assert!(renderer
        .state()
        .audio_backend_tracks()
        .contains_key("bgm-main"));
    assert_eq!(
        renderer.backend().resident_resource_ids,
        vec!["images:bg.png"]
    );
    assert!(renderer.backend().released_resource_ids.is_empty());
}

#[test]
fn clear_renderer_with_host_texture_cleanup_and_media_teardown_releases_texture_handles() {
    let mut renderer = NativeRenderer::with_null_audio_backend(TextureResidentBackend {
        resident_resource_ids: vec!["images:bg.png".to_string()],
        ..Default::default()
    });
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture).owned_by("base"),
    );

    let result = clear_renderer_with_host_texture_cleanup_and_media_teardown(&mut renderer)
        .expect("empty media teardown should not block renderer clear");

    assert_eq!(result.released_resources.len(), 1);
    assert_eq!(result.host_cleanup.len(), 1);
    assert_eq!(result.texture_cleanup_report.released_count, 1);
    assert_eq!(
        result.texture_cleanup_report.released_resource_ids,
        vec![ResourceId::from("images:bg.png")]
    );
    assert!(renderer.resources().is_empty());
    assert!(renderer.backend().resident_resource_ids.is_empty());
}

fn host_cleanup_record(
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
