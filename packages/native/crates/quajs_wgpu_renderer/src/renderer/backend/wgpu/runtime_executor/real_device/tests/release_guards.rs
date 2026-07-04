use super::*;

mod bind_group;
mod buffer;
mod pipeline;
mod recreate;

fn apply_operations(
    device: &mut RealWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    operations: impl IntoIterator<Item = WgpuNativeRenderRuntimeOperation>,
) {
    for operation in operations {
        device
            .apply_runtime_operation(&operation, report)
            .expect("setup operation should apply");
    }
}

fn active_pass(device: &RealWgpuNativeRenderRuntimeDevice) -> &RealRuntimePass {
    device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("expected active pass")
}

fn assert_recreate_guard_error(
    error: &WgpuNativeRenderRuntimeError,
    resource_kind: &str,
    label: &str,
) {
    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains(resource_kind));
    assert!(error.message.contains(label));
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:first"));
}

fn solid_pipeline_key() -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

fn textured_pipeline_key() -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Image,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

fn vertex_buffer(label: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateBuffer {
        label: label.to_string(),
        descriptor: vertex_buffer_descriptor(label),
        byte_len: 128,
    }
}

fn vertex_buffer_descriptor(label: &str) -> WgpuNativeRenderBufferDescriptor {
    WgpuNativeRenderBufferDescriptor {
        label: label.to_string(),
        role: WgpuNativeRenderBufferRole::Vertex,
        byte_len: 128,
        element_count: 4,
        usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
    }
}

fn index_buffer(label: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateBuffer {
        label: label.to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: label.to_string(),
            role: WgpuNativeRenderBufferRole::Index,
            byte_len: 24,
            element_count: 6,
            usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
        },
        byte_len: 24,
    }
}

fn create_bind_group(cache_label: &str, resource_id: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateBindGroup {
        cache_label: cache_label.to_string(),
        command_id: "ui:image".to_string(),
        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        resource_ids: vec![resource_id.to_string()],
    }
}

fn create_encoder(command_count: usize) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
        label: "encoder".to_string(),
        pass_count: 1,
        command_count,
    }
}

fn begin_pass(command_count: usize) -> WgpuNativeRenderRuntimeOperation {
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
        command_count,
    }
}

fn set_vertex_buffer(label: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
        pass_label: "pass".to_string(),
        buffer_label: label.to_string(),
        byte_len: 128,
    }
}

fn set_index_buffer(label: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
        pass_label: "pass".to_string(),
        buffer_label: label.to_string(),
        byte_len: 24,
    }
}

fn set_bind_group(cache_label: &str, resource_id: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::SetBindGroup {
        pass_label: "pass".to_string(),
        command_id: "ui:image".to_string(),
        cache_label: cache_label.to_string(),
        resource_ids: vec![resource_id.to_string()],
    }
}

fn draw(command_id: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::DrawIndexed {
        pass_label: "pass".to_string(),
        command_id: command_id.to_string(),
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
    }
}
