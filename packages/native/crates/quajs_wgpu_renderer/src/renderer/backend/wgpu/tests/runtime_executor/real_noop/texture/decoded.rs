use super::*;

#[test]
fn real_noop_backend_uses_uploaded_decoded_texture_in_generated_frame_plan() {
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
            "images:bg/school.png",
            RealWgpuDecodedTextureRgba8::new(
                2,
                2,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ],
            ),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.bg")
                .require_package("base"),
        )
        .unwrap();

    let result = renderer
        .prepare_and_render(
            resolve_stage_layout(
                Some(ViewLayoutInput {
                    preset: Some(ViewLayoutOrientation::Landscape),
                    ..Default::default()
                }),
                StageContainerInput {
                    width: Some(1600.0),
                    height: Some(900.0),
                    ..Default::default()
                },
            ),
            &textured_background_view("bg/school.png"),
        )
        .unwrap();

    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(renderer.backend().decoded_texture_resource_count(), 1);
    assert!(result.texture_upload_sync.pending_requests.is_empty());
    assert_eq!(
        result.texture_upload_sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(result
        .texture_upload_sync
        .orphaned_resident_resource_ids
        .is_empty());
    assert_eq!(runtime_report.draw_indexed_count, 1);
    assert_eq!(runtime_report.bind_group_create_count, 1);
    assert_eq!(runtime_report.resident_texture_count, 1);
    assert_eq!(runtime_report.resident_texture_byte_len, 16);
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .decoded_bind_group_count,
        1
    );
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        0
    );
    assert!(runtime_report
        .texture_sampler_diagnostics
        .decoded_resource_ids_by_bind_group
        .values()
        .any(|resource_id| resource_id == "images:bg/school.png"));
    assert_eq!(
        runtime_report
            .resident_texture_byte_len_by_package
            .get("runtime.bg"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 1,
            dependent_count: 0,
            owned_byte_len: 16,
            dependent_byte_len: 0,
        })
    );
    assert_eq!(
        runtime_report
            .resident_texture_byte_len_by_package
            .get("base"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 0,
            dependent_count: 1,
            owned_byte_len: 0,
            dependent_byte_len: 16,
        })
    );
    assert_eq!(
        renderer.backend().runtime_snapshot().resident_texture_count,
        1
    );
    assert_eq!(
        renderer
            .backend_mut()
            .release_decoded_textures_for_package("runtime.bg"),
        1
    );
    assert!(!renderer
        .backend_mut()
        .release_decoded_texture("images:bg/school.png"));
    assert_eq!(renderer.backend().decoded_texture_resource_count(), 0);
}
