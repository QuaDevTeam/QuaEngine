use super::*;

#[test]
fn noop_device_materializes_builtin_text_atlas_bind_group() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::text-atlas".to_string(),
                command_id: "dialogue:text".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
                resource_ids: vec!["fonts:dialogue.atlas".to_string()],
            },
            &mut report,
        )
        .unwrap();

    let bind_group = device
        .bind_groups
        .get("bind-group::text-atlas")
        .expect("text atlas bind group should be resident");
    assert_eq!(
        bind_group.layout,
        WgpuNativeRenderBindGroupLayout::TextAtlas
    );
    assert!(bind_group.texture_sampler.is_some());
    assert_eq!(report.bind_group_create_count, 1);
}

#[test]
fn noop_device_rejects_bind_group_resource_mismatch() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let texture_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Image,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };

    for operation in [
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: "pipeline::texture".to_string(),
            key: texture_key.clone(),
            descriptor: pipeline_descriptor("pipeline::texture", texture_key.clone()),
        },
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::texture".to_string(),
            command_id: "background:image".to_string(),
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            resource_ids: vec!["images:bg.png".to_string()],
        },
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
            label: "encoder".to_string(),
            pass_count: 1,
            command_count: 3,
        },
        WgpuNativeRenderRuntimeOperation::BeginRenderPass {
            encoder_label: "encoder".to_string(),
            pass_label: "pass".to_string(),
            pass_index: 0,
            plane: None,
            viewport: WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 64,
                height: 64,
            },
            command_count: 3,
        },
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: "pass".to_string(),
            command_id: "background:image".to_string(),
            key: texture_key,
            cache_label: "pipeline::texture".to_string(),
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("setup operation should apply");
    }

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "background:image".to_string(),
                cache_label: "bind-group::texture".to_string(),
                resource_ids: vec!["images:other.png".to_string()],
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("resource ids"));
    assert!(error.message.contains("images:bg.png"));
    assert!(error.message.contains("images:other.png"));
}
