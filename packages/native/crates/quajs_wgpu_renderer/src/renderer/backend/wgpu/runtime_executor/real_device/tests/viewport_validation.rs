use super::*;

#[test]
fn noop_device_rejects_out_of_bounds_viewport_update_immediately() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let initial_viewport = WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: 64,
        height: 64,
    };

    for operation in [
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
            viewport: initial_viewport,
            command_count: 2,
        },
    ] {
        device
            .apply_runtime_operation(&operation, &mut report)
            .expect("setup operation should apply");
    }

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::SetViewport {
                pass_label: "pass".to_string(),
                viewport: WgpuPhysicalRect {
                    x: 32,
                    y: 0,
                    width: 40,
                    height: 64,
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
    assert!(error.message.contains("viewport"));
    assert!(error.message.contains("target extent"));

    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("valid pass should remain active after rejected viewport update");
    assert_eq!(pass.viewport, initial_viewport);
}
