use super::*;

#[test]
fn noop_device_snapshots_vertex_and_index_buffers_per_draw() {
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
            label: "vertex-a".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "vertex-a".to_string(),
                role: WgpuNativeRenderBufferRole::Vertex,
                byte_len: 128,
                element_count: 4,
                usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
            },
            byte_len: 128,
        },
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label: "vertex-b".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "vertex-b".to_string(),
                role: WgpuNativeRenderBufferRole::Vertex,
                byte_len: 128,
                element_count: 4,
                usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
            },
            byte_len: 128,
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
        WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
            pass_label: "pass".to_string(),
            buffer_label: "index".to_string(),
            byte_len: 24,
        },
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: "pass".to_string(),
            command_id: "ui:first".to_string(),
            key: solid_key,
            cache_label: "pipeline::solid".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label: "pass".to_string(),
            buffer_label: "vertex-a".to_string(),
            byte_len: 128,
        },
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: "ui:first".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 32,
                height: 32,
            },
            scissor: None,
        },
        WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label: "pass".to_string(),
            buffer_label: "vertex-b".to_string(),
            byte_len: 128,
        },
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: "ui:second".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: WgpuPhysicalRect {
                x: 32,
                y: 32,
                width: 24,
                height: 24,
            },
            scissor: None,
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("operation should apply");
    }

    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("expected active pass before materialization");

    assert_eq!(pass.draws.len(), 2);
    assert_eq!(pass.draws[0].vertex_buffer_label, "vertex-a");
    assert_eq!(pass.draws[0].index_buffer_label, "index");
    assert_eq!(pass.draws[1].vertex_buffer_label, "vertex-b");
    assert_eq!(pass.draws[1].index_buffer_label, "index");
}
