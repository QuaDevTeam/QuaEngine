use super::*;

#[test]
fn noop_device_invalidates_placeholder_sampler_after_decoded_texture_upload() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let create_bind_group = WgpuNativeRenderRuntimeOperation::CreateBindGroup {
        cache_label: "bind-group::texture".to_string(),
        command_id: "background:image".to_string(),
        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        resource_ids: vec!["images:bg.png".to_string()],
    };

    device
        .apply_runtime_operation(
            &create_bind_group,
            &mut WgpuNativeRenderRuntimeExecutionReport::default(),
        )
        .unwrap();
    assert_eq!(
        device
            .snapshot()
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );

    device
        .upload_decoded_texture_rgba8(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();
    assert!(!device.bind_groups.contains_key("bind-group::texture"));

    device
        .apply_runtime_operation(
            &create_bind_group,
            &mut WgpuNativeRenderRuntimeExecutionReport::default(),
        )
        .unwrap();
    let texture_sampler = device
        .bind_groups
        .get("bind-group::texture")
        .unwrap()
        .texture_sampler
        .as_ref()
        .unwrap();
    assert_eq!(
        texture_sampler.decoded_resource_id.as_deref(),
        Some("images:bg.png")
    );
}

#[test]
fn noop_device_invalidates_decoded_sampler_after_decoded_texture_release() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();
    let create_bind_group = WgpuNativeRenderRuntimeOperation::CreateBindGroup {
        cache_label: "bind-group::texture".to_string(),
        command_id: "background:image".to_string(),
        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        resource_ids: vec!["images:bg.png".to_string()],
    };

    device
        .apply_runtime_operation(
            &create_bind_group,
            &mut WgpuNativeRenderRuntimeExecutionReport::default(),
        )
        .unwrap();
    assert_eq!(
        device
            .snapshot()
            .texture_sampler_diagnostics
            .decoded_bind_group_count,
        1
    );

    assert!(device.release_decoded_texture("images:bg.png"));
    assert!(!device.bind_groups.contains_key("bind-group::texture"));

    device
        .apply_runtime_operation(
            &create_bind_group,
            &mut WgpuNativeRenderRuntimeExecutionReport::default(),
        )
        .unwrap();
    let texture_sampler = device
        .bind_groups
        .get("bind-group::texture")
        .unwrap()
        .texture_sampler
        .as_ref()
        .unwrap();
    assert!(texture_sampler.decoded_resource_id.is_none());
    assert_eq!(
        texture_sampler.placeholder_rgba8,
        placeholder_texture_rgba8(&["images:bg.png".to_string()])
    );
}
