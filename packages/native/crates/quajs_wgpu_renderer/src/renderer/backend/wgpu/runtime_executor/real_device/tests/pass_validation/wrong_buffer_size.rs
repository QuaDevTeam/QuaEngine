use super::support::{apply_setup_operations, assert_active_pass_labels, noop_device};
use super::*;

#[test]
fn noop_device_does_not_poison_pass_state_when_binding_wrong_buffer_size() {
    let mut device = noop_device();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();

    apply_setup_operations(
        &mut device,
        &mut report,
        [
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "vertex".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "vertex".to_string(),
                    role: WgpuNativeRenderBufferRole::Vertex,
                    byte_len: 64,
                    element_count: 2,
                    usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
                },
                byte_len: 64,
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
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
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
    assert!(error.message.contains("vertex"));
    assert!(error.message.contains("byte length mismatch"));
    assert_active_pass_labels(
        &device,
        None,
        None,
        None,
        "pass should remain active after rejected vertex bind",
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
                byte_len: 16,
            },
            &mut report,
        )
        .unwrap_err();
    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("index"));
    assert!(error.message.contains("byte length mismatch"));
    assert_active_pass_labels(
        &device,
        None,
        None,
        None,
        "pass should remain active after rejected index bind",
    );
}
