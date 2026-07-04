use super::common::*;
use super::*;

#[test]
fn rejects_begin_render_pass_with_empty_viewport() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 1,
            },
            &mut report,
        )
        .expect("encoder should be created");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "pass".to_string(),
                pass_index: 0,
                plane: None,
                viewport: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 64,
                },
                command_count: 1,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pass"));
    assert!(error.message.contains("empty viewport"));
}

#[test]
fn rejects_empty_viewport_update_without_closing_pass() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_open_pass_setup(&mut device, &mut report);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetViewport {
                pass_label: "pass".to_string(),
                viewport: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 0,
                },
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pass"));
    assert!(error.message.contains("empty viewport"));

    for operation in [
        WgpuNativeRenderRuntimeOperation::SetViewport {
            pass_label: "pass".to_string(),
            viewport: WgpuPhysicalRect {
                x: 0,
                y: 0,
                width: 32,
                height: 32,
            },
        },
        WgpuNativeRenderRuntimeOperation::EndRenderPass {
            pass_label: "pass".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
            encoder_label: "encoder".to_string(),
            pass_count: 1,
            command_count: 3,
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("valid follow-up operation should still apply");
    }
}

#[test]
fn rejects_draw_with_empty_scissor() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_ready_setup(&mut device, &mut report);

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::DrawIndexed {
                pass_label: "pass".to_string(),
                command_id: "ui:empty-scissor".to_string(),
                first_index: 0,
                index_count: 6,
                first_vertex: 0,
                vertex_count: 4,
                physical_bounds: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                },
                scissor: Some(WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 64,
                }),
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("ui:empty-scissor"));
    assert!(error.message.contains("empty scissor"));
}

fn apply_open_pass_setup(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
) {
    apply_setup_operations(
        device,
        report,
        vec![
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 3,
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
                command_count: 3,
            },
        ],
    );
}

fn apply_draw_ready_setup(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
) {
    let pipeline_request = pipeline("pipeline::solid", DrawBatchPipeline::Ui);
    let mut key = pipeline_request.key.clone();
    key.bind_group_layout = WgpuNativeRenderBindGroupLayout::None;
    apply_setup_operations(
        device,
        report,
        vec![
            create_buffer_operation("vertex", WgpuNativeRenderBufferRole::Vertex, 128),
            create_buffer_operation("index", WgpuNativeRenderBufferRole::Index, 24),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: pipeline_request.cache_label.clone(),
                key: key.clone(),
                descriptor: WgpuNativeRenderPipelineDescriptor {
                    key: key.clone(),
                    ..pipeline_request.descriptor.clone()
                },
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 7,
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
                command_count: 7,
            },
            WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex".to_string(),
                byte_len: 128,
            },
            WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
                byte_len: 24,
            },
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:empty-scissor".to_string(),
                key,
                cache_label: pipeline_request.cache_label.clone(),
            },
        ],
    );
}
