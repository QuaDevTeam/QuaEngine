use super::*;

#[test]
fn noop_device_uses_uploaded_decoded_texture_for_matching_resource_id() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(
                2,
                2,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ],
            ),
        )
        .unwrap();
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 9,
        operation_count: 1,
        cache_operation_count: 1,
        operations: vec![WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::texture".to_string(),
            command_id: "background:image".to_string(),
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            resource_ids: vec!["images:bg.png".to_string()],
        }],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.resident_bind_group_count, 1);
    assert_eq!(report.resident_texture_count, 1);
    assert_eq!(report.resident_texture_byte_len, 16);
    assert_eq!(
        report.resident_texture_resource_ids,
        vec!["images:bg.png".to_string()]
    );
    assert_eq!(
        report.texture_sampler_diagnostics.decoded_bind_group_count,
        1
    );
    assert_eq!(
        report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        0
    );
    assert_eq!(
        report
            .texture_sampler_diagnostics
            .decoded_resource_ids_by_bind_group
            .get("bind-group::texture"),
        Some(&"images:bg.png".to_string())
    );
    let bind_group = executor
        .device()
        .bind_groups
        .get("bind-group::texture")
        .unwrap();
    let texture_sampler = bind_group.texture_sampler.as_ref().unwrap();
    assert_eq!(
        texture_sampler.decoded_resource_id.as_deref(),
        Some("images:bg.png")
    );
    assert_eq!(texture_sampler.decoded_size, Some((2, 2)));
    assert_eq!(texture_sampler.decoded_byte_len, Some(16));
}

#[test]
fn noop_device_uses_uploaded_decoded_texture_for_text_atlas_resource() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8(
            "fonts:Qua Sans",
            RealWgpuDecodedTextureRgba8::new(
                2,
                2,
                vec![
                    255, 255, 255, 0, 255, 255, 255, 64, 255, 255, 255, 128, 255, 255, 255, 255,
                ],
            ),
        )
        .unwrap();
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 10,
        operation_count: 1,
        cache_operation_count: 1,
        operations: vec![WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::text-atlas".to_string(),
            command_id: "dialogue:text".to_string(),
            layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
            resource_ids: vec!["fonts:Qua Sans".to_string()],
        }],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(
        report.texture_sampler_diagnostics.decoded_bind_group_count,
        1
    );
    assert_eq!(
        report
            .texture_sampler_diagnostics
            .decoded_resource_ids_by_bind_group
            .get("bind-group::text-atlas"),
        Some(&"fonts:Qua Sans".to_string())
    );
    let bind_group = executor
        .device()
        .bind_groups
        .get("bind-group::text-atlas")
        .unwrap();
    let texture_sampler = bind_group.texture_sampler.as_ref().unwrap();
    assert_eq!(
        texture_sampler.decoded_resource_id.as_deref(),
        Some("fonts:Qua Sans")
    );
    assert_eq!(texture_sampler.decoded_size, Some((2, 2)));
    assert_eq!(texture_sampler.decoded_byte_len, Some(16));
}
