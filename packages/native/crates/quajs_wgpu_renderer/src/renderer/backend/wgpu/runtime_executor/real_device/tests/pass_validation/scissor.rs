use super::support::{
    apply_setup_operations, assert_active_pass_has_no_draws, noop_device, solid_ui_pipeline_key,
};
use super::*;

#[test]
fn noop_device_rejects_out_of_bounds_scissor_on_draw_command() {
    let mut device = noop_device();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_ui_pipeline_key();

    apply_setup_operations(
        &mut device,
        &mut report,
        [
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "vertex".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "vertex".to_string(),
                    role: WgpuNativeRenderBufferRole::Vertex,
                    byte_len: 128,
                    element_count: 4,
                    usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
                },
                byte_len: 128,
            },
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "index".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "index".to_string(),
                    role: WgpuNativeRenderBufferRole::Index,
                    byte_len: 24,
                    element_count: 6,
                    usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
                },
                byte_len: 24,
            },
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::solid".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 6,
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
                command_count: 6,
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
                command_id: "ui:panel".to_string(),
                key: solid_key,
                cache_label: "pipeline::solid".to_string(),
            },
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::DrawIndexed {
                pass_label: "pass".to_string(),
                command_id: "ui:panel".to_string(),
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
                    x: 60,
                    y: 0,
                    width: 8,
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
    assert!(error.message.contains("ui:panel"));
    assert!(error.message.contains("scissor"));
    assert!(error.message.contains("target extent"));
    assert_active_pass_has_no_draws(&device, "pass should remain active after rejected draw");
}
