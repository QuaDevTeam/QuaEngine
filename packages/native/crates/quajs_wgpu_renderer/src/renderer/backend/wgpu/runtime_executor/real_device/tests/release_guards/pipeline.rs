use super::*;

#[test]
fn noop_device_rejects_releasing_bound_pipeline_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::solid".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
            },
            create_encoder(7),
            begin_pass(7),
            set_vertex_buffer("vertex"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:panel".to_string(),
                key: solid_key,
                cache_label: "pipeline::solid".to_string(),
            },
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleasePipeline {
                cache_label: "pipeline::solid".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pipeline::solid"));
    assert!(error.message.contains("active pass"));
    assert!(device.pipelines.contains_key("pipeline::solid"));

    let pass = active_pass(&device);
    assert!(pass.draws.is_empty());
}

#[test]
fn noop_device_rejects_releasing_queued_draw_pipeline_during_active_pass() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_pipeline_key();

    apply_operations(
        &mut device,
        &mut report,
        [
            vertex_buffer("vertex"),
            index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::first".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::first", solid_key.clone()),
            },
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::second".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::second", solid_key.clone()),
            },
            create_encoder(9),
            begin_pass(9),
            set_vertex_buffer("vertex"),
            set_index_buffer("index"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:first".to_string(),
                key: solid_key.clone(),
                cache_label: "pipeline::first".to_string(),
            },
            draw("ui:first"),
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:second".to_string(),
                key: solid_key,
                cache_label: "pipeline::second".to_string(),
            },
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleasePipeline {
                cache_label: "pipeline::first".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pipeline::first"));
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:first"));
    assert!(device.pipelines.contains_key("pipeline::first"));

    let pass = active_pass(&device);
    assert_eq!(pass.draws.len(), 1);
    assert_eq!(pass.draws[0].pipeline_cache_label, "pipeline::first");
}
