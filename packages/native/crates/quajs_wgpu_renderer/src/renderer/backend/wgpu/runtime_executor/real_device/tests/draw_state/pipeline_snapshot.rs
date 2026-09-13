use super::*;

#[test]
fn noop_device_snapshots_draw_pipeline_state_inside_mixed_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let image_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Image,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
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
            cache_label: "pipeline::image".to_string(),
            key: image_key.clone(),
            descriptor: pipeline_descriptor("pipeline::image", image_key.clone()),
        },
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: "pipeline::solid".to_string(),
            key: solid_key.clone(),
            descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
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
            command_count: 9,
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
            command_count: 9,
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
            command_id: "ui:image".to_string(),
            key: image_key,
            cache_label: "pipeline::image".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::SetBindGroup {
            pass_label: "pass".to_string(),
            command_id: "ui:image".to_string(),
            cache_label: "bind-group::image".to_string(),
            resource_ids: vec!["images:ui/icon.png".to_string()],
        },
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: "ui:image".to_string(),
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
    assert_eq!(pass.draws[0].command_id, "ui:image");
    assert_eq!(pass.draws[0].pipeline_cache_label, "pipeline::image");
    assert_eq!(
        pass.draws[0].bind_group_cache_label.as_deref(),
        Some("bind-group::image")
    );
    assert_eq!(pass.draws[1].command_id, "ui:panel");
    assert_eq!(pass.draws[1].pipeline_cache_label, "pipeline::solid");
    assert_eq!(pass.draws[1].bind_group_cache_label.as_deref(), None);
    assert_eq!(pass.bind_group_cache_label.as_deref(), None);
}
