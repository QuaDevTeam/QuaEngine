use super::*;

#[test]
fn noop_device_rejects_releasing_bound_bind_group_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let textured_key = textured_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::textured".to_string(),
                key: textured_key.clone(),
                descriptor: pipeline_descriptor("pipeline::textured", textured_key.clone()),
            },
            create_bind_group("bind-group::image", "images:ui/icon.png"),
            create_encoder(8),
            begin_pass(8),
            set_vertex_buffer("vertex"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:image".to_string(),
                key: textured_key,
                cache_label: "pipeline::textured".to_string(),
            },
            set_bind_group("bind-group::image", "images:ui/icon.png"),
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleaseBindGroup {
                cache_label: "bind-group::image".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("bind-group::image"));
    assert!(error.message.contains("active pass"));
    assert!(device.bind_groups.contains_key("bind-group::image"));

    let pass = active_pass(&device);
    assert!(pass.draws.is_empty());
}

#[test]
fn noop_device_rejects_releasing_queued_draw_bind_group_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let textured_key = textured_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::textured".to_string(),
                key: textured_key.clone(),
                descriptor: pipeline_descriptor("pipeline::textured", textured_key.clone()),
            },
            create_bind_group("bind-group::first", "images:first.png"),
            create_bind_group("bind-group::second", "images:second.png"),
            create_encoder(10),
            begin_pass(10),
            set_vertex_buffer("vertex"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:first".to_string(),
                key: textured_key,
                cache_label: "pipeline::textured".to_string(),
            },
            set_bind_group("bind-group::first", "images:first.png"),
            draw("ui:first"),
            set_bind_group("bind-group::second", "images:second.png"),
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleaseBindGroup {
                cache_label: "bind-group::first".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("bind-group::first"));
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:first"));
    assert!(device.bind_groups.contains_key("bind-group::first"));

    let pass = active_pass(&device);
    assert_eq!(pass.draws.len(), 1);
    assert_eq!(
        pass.draws[0].bind_group_cache_label.as_deref(),
        Some("bind-group::first")
    );
}
