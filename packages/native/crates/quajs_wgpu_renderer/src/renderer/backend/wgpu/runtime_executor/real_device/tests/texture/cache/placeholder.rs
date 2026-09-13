use super::*;

#[test]
fn noop_device_falls_back_to_placeholder_after_decoded_texture_release() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();

    assert!(device.release_decoded_texture("images:bg.png"));
    assert!(!device.release_decoded_texture("images:bg.png"));
    assert_eq!(device.snapshot().resident_texture_count, 0);

    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::texture".to_string(),
                command_id: "background:image".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:bg.png".to_string()],
            },
            &mut report,
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
    let snapshot = device.snapshot();
    assert_eq!(
        snapshot
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );
    assert_eq!(
        snapshot
            .texture_sampler_diagnostics
            .placeholder_resource_ids_by_bind_group
            .get("bind-group::texture"),
        Some(&vec!["images:bg.png".to_string()])
    );
}

#[test]
fn noop_device_recreates_placeholder_sampler_when_resource_ids_change() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::texture".to_string(),
                command_id: "background:image".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:first.png".to_string()],
            },
            &mut report,
        )
        .unwrap();

    let first_placeholder = device
        .bind_groups
        .get("bind-group::texture")
        .unwrap()
        .texture_sampler
        .as_ref()
        .unwrap()
        .placeholder_rgba8;

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
                cache_label: "bind-group::texture".to_string(),
                command_id: "background:image".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:second.png".to_string()],
            },
            &mut report,
        )
        .unwrap();

    let recreated = device.bind_groups.get("bind-group::texture").unwrap();
    let recreated_sampler = recreated.texture_sampler.as_ref().unwrap();

    assert_eq!(recreated.resource_ids, vec!["images:second.png"]);
    assert_eq!(
        recreated_sampler.placeholder_rgba8,
        placeholder_texture_rgba8(&["images:second.png".to_string()])
    );
    assert_ne!(recreated_sampler.placeholder_rgba8, first_placeholder);
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.bind_group_recreate_count, 1);
    let snapshot = device.snapshot();
    assert_eq!(
        snapshot
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );
    assert_eq!(
        snapshot
            .texture_sampler_diagnostics
            .placeholder_resource_ids_by_bind_group
            .get("bind-group::texture"),
        Some(&vec!["images:second.png".to_string()])
    );
}
