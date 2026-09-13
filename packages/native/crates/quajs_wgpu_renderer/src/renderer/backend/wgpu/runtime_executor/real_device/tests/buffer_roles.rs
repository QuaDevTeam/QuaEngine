use super::*;

#[test]
fn noop_device_rejects_index_buffer_bound_as_vertex_buffer() {
    let mut device = prepared_device_with_open_pass();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
                byte_len: 24,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("role mismatch"));
    assert!(error.message.contains("Index"));
    assert!(error.message.contains("Vertex"));

    let pass = active_pass(&device);
    assert!(pass.vertex_buffer_label.is_none());
    assert!(pass.index_buffer_label.is_none());
}

#[test]
fn noop_device_rejects_vertex_buffer_bound_as_index_buffer() {
    let mut device = prepared_device_with_open_pass();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex".to_string(),
                byte_len: 128,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("role mismatch"));
    assert!(error.message.contains("Vertex"));
    assert!(error.message.contains("Index"));

    let pass = active_pass(&device);
    assert!(pass.vertex_buffer_label.is_none());
    assert!(pass.index_buffer_label.is_none());
}

fn prepared_device_with_open_pass() -> RealWgpuNativeRenderRuntimeDevice {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    for operation in [
        create_buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 128),
        create_buffer("index", WgpuNativeRenderBufferRole::Index, 24),
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
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("setup operation should apply");
    }

    device
}

fn create_buffer(
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateBuffer {
        label: label.to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: label.to_string(),
            role,
            byte_len,
            element_count: match role {
                WgpuNativeRenderBufferRole::Vertex => 4,
                WgpuNativeRenderBufferRole::Index => 6,
            },
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
        byte_len,
    }
}

fn active_pass(device: &RealWgpuNativeRenderRuntimeDevice) -> &RealRuntimePass {
    device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("pass should remain active after rejected binding")
}
