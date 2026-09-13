use super::*;

#[test]
fn rejects_releasing_bound_pipeline_in_active_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_active_texture_pass_setup(&mut device, &mut report);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleasePipeline {
                cache_label: "pipeline::ui".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("cannot release pipeline"));
    assert!(error.message.contains("pipeline::ui"));
    assert!(error.message.contains("active pass"));
}

#[test]
fn rejects_recreating_bound_bind_group_in_active_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_active_texture_pass_setup(&mut device, &mut report);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
                cache_label: "bind-group::ui".to_string(),
                command_id: "ui:button".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:replacement.png".to_string()],
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("cannot recreate bind group"));
    assert!(error.message.contains("bind-group::ui"));
    assert!(error.message.contains("active pass"));
}

#[test]
fn rejects_releasing_buffer_referenced_by_queued_draw_in_active_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_queued_draw_setup(&mut device, &mut report);

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex::second".to_string(),
                byte_len: QUAD_VERTEX_BYTE_LEN,
            },
            &mut report,
        )
        .expect("replacement vertex buffer should bind");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleaseBuffer {
                label: "vertex::first".to_string(),
                byte_len: QUAD_VERTEX_BYTE_LEN,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:button"));
    assert!(error.message.contains("vertex::first"));
}

#[test]
fn rejects_recreating_pipeline_referenced_by_queued_draw_in_active_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let replacement_pipeline = pipeline("pipeline::image", DrawBatchPipeline::Image);
    apply_queued_draw_setup(&mut device, &mut report);

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:image".to_string(),
                key: replacement_pipeline.key.clone(),
                cache_label: replacement_pipeline.cache_label.clone(),
            },
            &mut report,
        )
        .expect("replacement pipeline should bind");

    let original_pipeline = pipeline("pipeline::ui", DrawBatchPipeline::Ui);
    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::RecreatePipeline {
                cache_label: "pipeline::ui".to_string(),
                key: original_pipeline.key.clone(),
                descriptor: original_pipeline.descriptor.clone(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:button"));
    assert!(error.message.contains("pipeline::ui"));
}

#[test]
fn rejects_releasing_bind_group_referenced_by_queued_draw_in_active_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_queued_draw_setup(&mut device, &mut report);

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "ui:replacement".to_string(),
                cache_label: "bind-group::replacement".to_string(),
                resource_ids: vec!["images:replacement.png".to_string()],
            },
            &mut report,
        )
        .expect("replacement bind group should bind");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReleaseBindGroup {
                cache_label: "bind-group::ui".to_string(),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("queued draw"));
    assert!(error.message.contains("ui:button"));
    assert!(error.message.contains("bind-group::ui"));
}
