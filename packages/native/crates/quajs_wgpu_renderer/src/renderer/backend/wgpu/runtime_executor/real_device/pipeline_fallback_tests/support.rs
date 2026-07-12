use super::*;

pub(super) fn noop_executor(
) -> InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice> {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device)
}

pub(super) fn vertex_buffer_operation() -> WgpuNativeRenderRuntimeOperation {
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
    }
}

pub(super) fn index_buffer_operation() -> WgpuNativeRenderRuntimeOperation {
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
    }
}

pub(super) fn pipeline_descriptor(
    label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> WgpuNativeRenderPipelineDescriptor {
    WgpuNativeRenderPipelineDescriptor {
        label: pipeline_label(label),
        key,
        vertex_layout: WgpuNativeRenderVertexLayout {
            array_stride: WgpuNativeRenderBufferVertex::BYTE_LEN,
            step_mode: WgpuNativeRenderVertexStepMode::Vertex,
            attributes: vec![],
        },
        index_format: WgpuNativeRenderIndexFormat::Uint32,
        primitive_topology: WgpuNativeRenderPrimitiveTopology::TriangleList,
    }
}

pub(super) fn pipeline_label(label: &str) -> String {
    format!("pipeline::{label}")
}

pub(super) fn command_id(label: &str) -> String {
    format!("fallback::{label}")
}
