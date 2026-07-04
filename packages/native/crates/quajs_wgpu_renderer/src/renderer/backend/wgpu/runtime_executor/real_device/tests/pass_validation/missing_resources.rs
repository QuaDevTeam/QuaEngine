use super::support::{
    apply_setup_operations, assert_active_pass_labels, noop_device, solid_ui_pipeline_key,
};
use super::*;

#[test]
fn noop_device_does_not_poison_pass_state_when_binding_missing_resources() {
    let mut device = noop_device();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = solid_ui_pipeline_key();

    apply_setup_operations(
        &mut device,
        &mut report,
        [
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 4,
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
                command_count: 4,
            },
        ],
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "missing-vertex".to_string(),
                byte_len: 128,
            },
            &mut report,
        )
        .unwrap_err();
    assert_eq!(error.kind, WgpuNativeRenderRuntimeErrorKind::MissingBuffer);
    assert_active_pass_labels(
        &device,
        None,
        None,
        None,
        "pass should remain active after rejected vertex bind",
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "missing-index".to_string(),
                byte_len: 24,
            },
            &mut report,
        )
        .unwrap_err();
    assert_eq!(error.kind, WgpuNativeRenderRuntimeErrorKind::MissingBuffer);
    assert_active_pass_labels(
        &device,
        None,
        None,
        None,
        "pass should remain active after rejected index bind",
    );

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "ui:missing".to_string(),
                key: solid_key,
                cache_label: "pipeline::missing".to_string(),
            },
            &mut report,
        )
        .unwrap_err();
    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::MissingPipeline
    );
    assert_active_pass_labels(
        &device,
        None,
        None,
        None,
        "pass should remain active after rejected pipeline bind",
    );
}
