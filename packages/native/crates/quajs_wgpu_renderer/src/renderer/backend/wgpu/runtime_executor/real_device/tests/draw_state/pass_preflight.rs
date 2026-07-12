use super::*;

#[test]
fn noop_device_preserves_active_pass_when_end_pass_preflight_fails() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };

    for operation in [
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label: "vertex".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "vertex".to_string(),
                role: WgpuNativeRenderBufferRole::Vertex,
                byte_len: QUAD_VERTEX_BYTE_LEN,
                element_count: 4,
                usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
            },
            byte_len: QUAD_VERTEX_BYTE_LEN,
        },
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label: "index".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "index".to_string(),
                role: WgpuNativeRenderBufferRole::Index,
                byte_len: 24,
                element_count: 6,
                usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
            byte_len: 24,
        },
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: "pipeline::solid".to_string(),
            key: solid_key.clone(),
            descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
        },
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
            label: "encoder".to_string(),
            pass_count: 1,
            command_count: 8,
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
            command_count: 8,
        },
        WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label: "pass".to_string(),
            buffer_label: "vertex".to_string(),
            byte_len: QUAD_VERTEX_BYTE_LEN,
        },
        WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
            pass_label: "pass".to_string(),
            buffer_label: "index".to_string(),
            byte_len: 24,
        },
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: "pass".to_string(),
            command_id: "ui:panel".to_string(),
            key: solid_key,
            cache_label: "pipeline::solid".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: "ui:panel".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 64,
                height: 64,
            },
            scissor: None,
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("setup operation should apply");
    }

    device.buffers.remove("vertex");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(error.kind, WgpuNativeRenderRuntimeErrorKind::MissingBuffer);
    assert!(error.message.contains("vertex"));

    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("pass should remain active after rejected end pass");
    assert_eq!(pass.draws.len(), 1);
    assert_eq!(pass.draws[0].command_id, "ui:panel");
}
