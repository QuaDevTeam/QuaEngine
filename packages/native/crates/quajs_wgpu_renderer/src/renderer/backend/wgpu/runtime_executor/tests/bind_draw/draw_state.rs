use super::*;

#[test]
fn rejects_draw_without_bound_vertex_buffer() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_active_texture_pass_setup(&mut device, &mut report);

    let error = device
        .apply_runtime_operation(&draw_indexed_operation("ui:button"), &mut report)
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("vertex buffer"));
}

#[test]
fn rejects_draw_without_bound_index_buffer() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let pipeline_request = pipeline("pipeline::ui", DrawBatchPipeline::Ui);

    apply_setup_operations(
        &mut device,
        &mut report,
        vec![
            create_buffer_operation("vertex", WgpuNativeRenderBufferRole::Vertex, 24),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: pipeline_request.cache_label.clone(),
                key: pipeline_request.key.clone(),
                descriptor: pipeline_request.descriptor.clone(),
            },
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::ui".to_string(),
                command_id: "ui:button".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:button.png".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 5,
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
                command_count: 5,
            },
            WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex".to_string(),
                byte_len: 24,
            },
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:button".to_string(),
                key: pipeline_request.key.clone(),
                cache_label: pipeline_request.cache_label.clone(),
            },
            WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "ui:button".to_string(),
                cache_label: "bind-group::ui".to_string(),
                resource_ids: vec!["images:button.png".to_string()],
            },
        ],
    );

    let error = device
        .apply_runtime_operation(&draw_indexed_operation("ui:button"), &mut report)
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("index buffer"));
}
