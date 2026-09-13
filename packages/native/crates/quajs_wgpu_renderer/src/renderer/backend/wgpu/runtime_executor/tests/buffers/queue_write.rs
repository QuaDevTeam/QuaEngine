use super::support::device_and_report;
use super::*;

#[test]
fn rejects_queue_write_payload_checksum_mismatch() {
    let mut plan = first_runtime_plan();
    let operation = plan
        .operations
        .iter_mut()
        .find(|operation| {
            matches!(
                operation,
                WgpuNativeRenderRuntimeOperation::QueueWrite { .. }
            )
        })
        .expect("expected queue write operation");
    if let WgpuNativeRenderRuntimeOperation::QueueWrite { checksum, .. } = operation {
        *checksum = checksum.wrapping_add(1);
    }
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();

    let error = executor.apply_runtime_plan(&plan).unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("checksum mismatch"));
}

#[test]
fn accepts_partial_queue_write_within_buffer_range() {
    let (mut device, mut report) = device_and_report();
    let bytes = vec![1, 2, 3, 4, 5, 6, 7, 8];

    apply_setup_operations(
        &mut device,
        &mut report,
        vec![create_buffer_operation(
            "vertex",
            WgpuNativeRenderBufferRole::Vertex,
            64,
        )],
    );

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging".to_string(),
                target_label: "vertex".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 16,
                byte_len: bytes.len(),
                checksum: test_checksum_bytes(&bytes),
                bytes,
            },
            &mut report,
        )
        .expect("partial queue write should apply within resident buffer range");

    assert_eq!(device.snapshot().resident_buffer_byte_len, 64);
}

#[test]
fn rejects_queue_write_exceeding_buffer_range() {
    let (mut device, mut report) = device_and_report();
    let bytes = vec![1, 2, 3, 4, 5, 6, 7, 8];

    apply_setup_operations(
        &mut device,
        &mut report,
        vec![create_buffer_operation(
            "vertex",
            WgpuNativeRenderBufferRole::Vertex,
            16,
        )],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging".to_string(),
                target_label: "vertex".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 12,
                byte_len: bytes.len(),
                checksum: test_checksum_bytes(&bytes),
                bytes,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("range exceeds buffer"));
    assert!(error.message.contains("vertex"));
}
