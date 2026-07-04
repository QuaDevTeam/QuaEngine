use super::*;

#[test]
fn noop_device_accumulates_multiple_passes_into_one_frame_target() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(128, 72);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let viewport = WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: 128,
        height: 72,
    };
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 2,
        operation_count: 6,
        encoder_count: 1,
        render_pass_count: 2,
        render_pass_command_count: 4,
        submit_count: 1,
        operations: vec![
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 2,
                command_count: 4,
            },
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "scene".to_string(),
                pass_index: 0,
                plane: None,
                viewport,
                command_count: 2,
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "scene".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "ui".to_string(),
                pass_index: 1,
                plane: None,
                viewport,
                command_count: 2,
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "ui".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 2,
                command_count: 4,
            },
        ],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.render_pass_count, 2);
    assert_eq!(report.submit_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 1);
    let frame_target = executor.device().frame_target_snapshot();
    assert_eq!(frame_target.extent.width, 128);
    assert_eq!(frame_target.extent.height, 72);
    assert_eq!(frame_target.completed_pass_count, 2);
}
