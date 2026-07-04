use super::*;

#[test]
fn noop_device_applies_buffer_upload_and_empty_render_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let bytes = bytes_for_len(64);
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 1,
        operation_count: 6,
        cache_operation_count: 1,
        queue_write_count: 1,
        queue_write_byte_len: bytes.len(),
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 2,
        submit_count: 1,
        operations: vec![
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "vertex".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "vertex".to_string(),
                    role: WgpuNativeRenderBufferRole::Vertex,
                    byte_len: bytes.len(),
                    element_count: bytes.len(),
                    usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
                },
                byte_len: bytes.len(),
            },
            WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging".to_string(),
                target_label: "vertex".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 0,
                byte_len: bytes.len(),
                checksum: checksum_bytes(&bytes),
                bytes,
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 2,
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
                command_count: 2,
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 1,
                command_count: 2,
            },
        ],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert!(executor.device_attached());
    assert_eq!(report.buffer_create_count, 1);
    assert_eq!(report.queue_write_count, 1);
    assert_eq!(report.render_pass_count, 1);
    assert_eq!(report.submit_count, 1);
    assert_eq!(report.resident_buffer_count, 1);
    assert_eq!(report.resident_buffer_byte_len, 64);
    assert_eq!(report.submitted_command_buffer_count, 1);
    let frame_target = executor.device().frame_target_snapshot();
    assert_eq!(frame_target.extent.width, 64);
    assert_eq!(frame_target.extent.height, 64);
    assert_eq!(frame_target.completed_pass_count, 1);
}
