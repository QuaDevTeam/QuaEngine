use super::*;

#[test]
fn noop_device_rejects_bind_group_before_pipeline_is_bound() {
    let mut device = prepared_device_with_open_pass();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "ui:image".to_string(),
                cache_label: "bind-group::image".to_string(),
                resource_ids: vec!["images:ui/icon.png".to_string()],
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pipeline"));

    let pass = active_pass(&device);
    assert!(pass.pipeline_cache_label.is_none());
    assert!(pass.bind_group_cache_label.is_none());
}

#[test]
fn noop_device_rejects_texture_bind_group_for_solid_pipeline() {
    let mut device = prepared_device_with_open_pass();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_pipeline_key();

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:panel".to_string(),
                key: solid_key,
                cache_label: "pipeline::solid".to_string(),
            },
            &mut report,
        )
        .expect("solid pipeline should bind");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "ui:panel".to_string(),
                cache_label: "bind-group::image".to_string(),
                resource_ids: vec!["images:ui/icon.png".to_string()],
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("resource bind group"));
    assert!(error.message.contains("None"));

    let pass = active_pass(&device);
    assert_eq!(
        pass.pipeline_cache_label.as_deref(),
        Some("pipeline::solid")
    );
    assert!(pass.bind_group_cache_label.is_none());
}

fn prepared_device_with_open_pass() -> RealWgpuNativeRenderRuntimeDevice {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_pipeline_key();

    for operation in [
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: "pipeline::solid".to_string(),
            key: solid_key.clone(),
            descriptor: pipeline_descriptor("pipeline::solid", solid_key),
        },
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::image".to_string(),
            command_id: "ui:image".to_string(),
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            resource_ids: vec!["images:ui/icon.png".to_string()],
        },
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
            label: "encoder".to_string(),
            pass_count: 1,
            command_count: 4,
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
            command_count: 4,
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("setup operation should apply");
    }

    device
}

fn solid_pipeline_key() -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

fn active_pass(device: &RealWgpuNativeRenderRuntimeDevice) -> &RealRuntimePass {
    device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("pass should remain active after rejected binding")
}
