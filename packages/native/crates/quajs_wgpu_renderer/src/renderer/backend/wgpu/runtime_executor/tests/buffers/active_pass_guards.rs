use super::support::{begin_pass_operations, device_and_report};
use super::*;

#[test]
fn rejects_releasing_bound_vertex_buffer_in_active_pass() {
    let (mut device, mut report) = device_and_report();

    let mut operations = vec![create_buffer_operation(
        "vertex",
        WgpuNativeRenderBufferRole::Vertex,
        24,
    )];
    operations.extend(begin_pass_operations(3));
    operations.push(WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
        pass_label: "pass".to_string(),
        buffer_label: "vertex".to_string(),
        byte_len: 24,
    });
    apply_setup_operations(&mut device, &mut report, operations);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleaseBuffer {
                label: "vertex".to_string(),
                byte_len: 24,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("cannot release buffer"));
    assert!(error.message.contains("vertex"));
    assert!(error.message.contains("active pass"));
}

#[test]
fn rejects_queue_write_to_bound_index_buffer_in_active_pass() {
    let (mut device, mut report) = device_and_report();

    let mut operations = vec![create_buffer_operation(
        "index",
        WgpuNativeRenderBufferRole::Index,
        8,
    )];
    operations.extend(begin_pass_operations(3));
    operations.push(WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
        pass_label: "pass".to_string(),
        buffer_label: "index".to_string(),
        byte_len: 8,
    });
    apply_setup_operations(&mut device, &mut report, operations);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging".to_string(),
                target_label: "index".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 0,
                byte_len: 8,
                checksum: 0,
                bytes: vec![0; 8],
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("cannot write to buffer"));
    assert!(error.message.contains("index"));
    assert!(error.message.contains("active pass"));
}
