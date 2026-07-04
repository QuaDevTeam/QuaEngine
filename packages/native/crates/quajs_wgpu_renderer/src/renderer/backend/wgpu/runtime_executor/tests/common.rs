use super::*;

pub(super) fn first_runtime_plan() -> WgpuNativeRenderRuntimePlan {
    runtime_plan(1, 128, "bind-group::new", "images:new.png", None)
}

pub(super) fn runtime_plan(
    revision: u64,
    byte_len: usize,
    bind_group_label: &str,
    resource_id: &str,
    previous_cache: Option<&WgpuNativeRenderResourceCachePlan>,
) -> WgpuNativeRenderRuntimePlan {
    let device = device_plan(
        revision,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, byte_len),
            buffer("index", WgpuNativeRenderBufferRole::Index, 24),
        ],
        vec![pipeline("pipeline::ui", DrawBatchPipeline::Ui)],
        vec![bind_group(bind_group_label, [resource_id])],
    );
    let cache = WgpuNativeRenderResourceCachePlan::from_device_plan(previous_cache, &device);
    WgpuNativeRenderRuntimePlan::from_device_and_cache_plans(&device, &cache)
}

pub(super) fn second_runtime_plan() -> WgpuNativeRenderRuntimePlan {
    let first_device = device_plan(
        1,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 128),
            buffer("index", WgpuNativeRenderBufferRole::Index, 24),
        ],
        vec![pipeline("pipeline::ui", DrawBatchPipeline::Ui)],
        vec![bind_group("bind-group::old", ["images:old.png"])],
    );
    let first_cache = WgpuNativeRenderResourceCachePlan::from_device_plan(None, &first_device);
    runtime_plan(
        2,
        160,
        "bind-group::new",
        "images:new.png",
        Some(&first_cache),
    )
}

pub(super) fn apply_active_texture_pass_setup(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
) {
    let pipeline_request = pipeline("pipeline::ui", DrawBatchPipeline::Ui);
    apply_setup_operations(
        device,
        report,
        vec![
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
}

pub(super) fn create_buffer_operation(
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::CreateBuffer {
        label: label.to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: label.to_string(),
            role,
            byte_len,
            element_count: byte_len,
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
        byte_len,
    }
}

pub(super) fn draw_indexed_operation(command_id: &str) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::DrawIndexed {
        pass_label: "pass".to_string(),
        command_id: command_id.to_string(),
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
        scissor: None,
    }
}

pub(super) fn apply_setup_operations(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    operations: Vec<WgpuNativeRenderRuntimeOperation>,
) {
    for operation in operations {
        device
            .apply_runtime_operation(&operation, report)
            .expect("setup operation should apply");
    }
}

pub(super) fn test_checksum_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct FailOnRevisionRuntimeDevice {
    pub(super) inner: InMemoryWgpuNativeRenderRuntimeDevice,
    pub(super) failing_revision: u64,
}

impl WgpuNativeRenderRuntimeDevice for FailOnRevisionRuntimeDevice {
    fn apply_runtime_operation(
        &mut self,
        operation: &WgpuNativeRenderRuntimeOperation,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if report.revision == self.failing_revision
            && matches!(
                operation,
                WgpuNativeRenderRuntimeOperation::QueueWrite { .. }
            )
        {
            return Err(WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "simulated device failure",
            ));
        }
        self.inner.apply_runtime_operation(operation, report)
    }

    fn finish_runtime_plan(&mut self) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.inner.finish_runtime_plan()
    }

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.inner.runtime_snapshot()
    }
}
