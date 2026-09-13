use super::*;

#[test]
fn noop_device_rejects_recreating_queued_draw_resources_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let textured_key = textured_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex::first"),
            vertex_buffer("vertex::second"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::first".to_string(),
                key: textured_key.clone(),
                descriptor: pipeline_descriptor("pipeline::first", textured_key.clone()),
            },
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::second".to_string(),
                key: textured_key.clone(),
                descriptor: pipeline_descriptor("pipeline::second", textured_key.clone()),
            },
            create_bind_group("bind-group::first", "images:first.png"),
            create_bind_group("bind-group::second", "images:second.png"),
            create_encoder(12),
            begin_pass(12),
            set_vertex_buffer("vertex::first"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:first".to_string(),
                key: textured_key.clone(),
                cache_label: "pipeline::first".to_string(),
            },
            set_bind_group("bind-group::first", "images:first.png"),
            draw("ui:first"),
            set_vertex_buffer("vertex::second"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:second".to_string(),
                key: textured_key.clone(),
                cache_label: "pipeline::second".to_string(),
            },
            set_bind_group("bind-group::second", "images:second.png"),
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreateBuffer {
                label: "vertex::first".to_string(),
                descriptor: vertex_buffer_descriptor("vertex::first"),
                byte_len: 128,
            },
            &mut report,
        )
        .unwrap_err();
    assert_recreate_guard_error(&error, "buffer", "vertex::first");
    assert!(device.buffers.contains_key("vertex::first"));

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreatePipeline {
                cache_label: "pipeline::first".to_string(),
                key: textured_key,
                descriptor: pipeline_descriptor("pipeline::first", textured_pipeline_key()),
            },
            &mut report,
        )
        .unwrap_err();
    assert_recreate_guard_error(&error, "pipeline", "pipeline::first");
    assert!(device.pipelines.contains_key("pipeline::first"));

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
                cache_label: "bind-group::first".to_string(),
                command_id: "ui:first".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:first.png".to_string()],
            },
            &mut report,
        )
        .unwrap_err();
    assert_recreate_guard_error(&error, "bind group", "bind-group::first");
    assert!(device.bind_groups.contains_key("bind-group::first"));

    assert_eq!(report.buffer_recreate_count, 0);
    assert_eq!(report.pipeline_recreate_count, 0);
    assert_eq!(report.bind_group_recreate_count, 0);

    let pass = active_pass(&device);
    assert_eq!(pass.draws.len(), 1);
    assert_eq!(pass.draws[0].vertex_buffer_label, "vertex::first");
    assert_eq!(pass.draws[0].pipeline_cache_label, "pipeline::first");
    assert_eq!(
        pass.draws[0].bind_group_cache_label.as_deref(),
        Some("bind-group::first")
    );
}
