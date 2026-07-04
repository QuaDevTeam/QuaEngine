use super::*;

#[test]
fn noop_device_rejects_writing_to_queued_draw_buffer_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex::first"),
            vertex_buffer("vertex::second"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::solid".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
            },
            create_encoder(10),
            begin_pass(10),
            set_vertex_buffer("vertex::first"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:first".to_string(),
                key: solid_key,
                cache_label: "pipeline::solid".to_string(),
            },
            draw("ui:first"),
            set_vertex_buffer("vertex::second"),
        ],
    );

    let bytes = bytes_for_len(16);
    let checksum = checksum_bytes(&bytes);
    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging::vertex-first".to_string(),
                target_label: "vertex::first".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 0,
                byte_len: bytes.len(),
                checksum,
                bytes,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("write to buffer"));
    assert!(error.message.contains("vertex::first"));
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:first"));

    let buffer = device.buffers.get("vertex::first").unwrap();
    assert_eq!(buffer.write_count, 0);
    assert_eq!(buffer.last_checksum, None);

    let pass = active_pass(&device);
    assert_eq!(pass.draws.len(), 1);
    assert_eq!(pass.draws[0].vertex_buffer_label, "vertex::first");
    assert_eq!(pass.vertex_buffer_label.as_deref(), Some("vertex::second"));
}
