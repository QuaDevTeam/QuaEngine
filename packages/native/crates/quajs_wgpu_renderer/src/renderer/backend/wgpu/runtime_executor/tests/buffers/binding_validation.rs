use super::support::{begin_pass_operations, device_and_report};
use super::*;

#[test]
fn rejects_binding_buffer_with_wrong_role() {
    let (mut device, mut report) = device_and_report();

    let mut operations = vec![WgpuNativeRenderRuntimeOperation::CreateBuffer {
        label: "index".to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: "index".to_string(),
            role: WgpuNativeRenderBufferRole::Index,
            byte_len: 24,
            element_count: 6,
            usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
        },
        byte_len: 24,
    }];
    operations.extend(begin_pass_operations(3));
    apply_setup_operations(&mut device, &mut report, operations);

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
}

#[test]
fn rejects_binding_buffer_with_mismatched_byte_len() {
    let (mut device, mut report) = device_and_report();

    let mut operations = vec![create_buffer_operation(
        "vertex",
        WgpuNativeRenderBufferRole::Vertex,
        24,
    )];
    operations.extend(begin_pass_operations(3));
    apply_setup_operations(&mut device, &mut report, operations);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex".to_string(),
                byte_len: 32,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("byte length mismatch"));
    assert!(error.message.contains("vertex"));
}
