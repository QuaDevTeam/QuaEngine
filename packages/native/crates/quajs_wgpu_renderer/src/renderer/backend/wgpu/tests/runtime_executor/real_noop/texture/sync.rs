use super::*;

#[test]
fn real_noop_backend_plans_texture_upload_sync_from_runtime_snapshot() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    let update = renderer.prepare_frame(
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
    );

    let pending = renderer
        .backend()
        .plan_texture_upload_sync(&update.texture_uploads);

    assert_eq!(pending.pending_requests.len(), 1);
    assert_eq!(
        pending
            .pending_request("images", "bg/school.png")
            .unwrap()
            .resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert!(pending.resident_resource_ids.is_empty());
    assert!(pending.orphaned_resident_resource_ids.is_empty());

    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:bg/school.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();
    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:stale.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![255, 255, 255, 255]),
        )
        .unwrap();

    let synced = renderer
        .backend()
        .plan_texture_upload_sync(&update.texture_uploads);

    assert!(synced.pending_requests.is_empty());
    assert_eq!(
        synced.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        synced.orphaned_resident_resource_ids,
        vec![ResourceId::from("images:stale.png")]
    );
}
