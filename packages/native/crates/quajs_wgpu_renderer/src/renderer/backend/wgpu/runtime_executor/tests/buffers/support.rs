use super::*;

pub(super) fn device_and_report() -> (
    InMemoryWgpuNativeRenderRuntimeDevice,
    WgpuNativeRenderRuntimeExecutionReport,
) {
    (
        InMemoryWgpuNativeRenderRuntimeDevice::default(),
        WgpuNativeRenderRuntimeExecutionReport::default(),
    )
}

pub(super) fn begin_pass_operations(command_count: usize) -> Vec<WgpuNativeRenderRuntimeOperation> {
    vec![
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
            label: "encoder".to_string(),
            pass_count: 1,
            command_count,
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
            command_count,
        },
    ]
}
