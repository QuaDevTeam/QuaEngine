use super::super::common::*;
use super::super::*;

pub(super) fn apply_draw_range_setup(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    vertex_byte_len: usize,
    index_byte_len: usize,
) {
    let pipeline_request = pipeline("pipeline::ui", DrawBatchPipeline::Ui);
    apply_setup_operations(
        device,
        report,
        vec![
            create_buffer_operation(
                "vertex",
                WgpuNativeRenderBufferRole::Vertex,
                vertex_byte_len,
            ),
            create_buffer_operation("index", WgpuNativeRenderBufferRole::Index, index_byte_len),
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
                byte_len: vertex_byte_len,
            },
            WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
                byte_len: index_byte_len,
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

pub(super) fn draw_range_operation(
    command_id: &str,
    first_index: u32,
    index_count: u32,
    first_vertex: u32,
    vertex_count: u32,
) -> WgpuNativeRenderRuntimeOperation {
    draw_range_operation_with_bounds(
        command_id,
        first_index,
        index_count,
        first_vertex,
        vertex_count,
        WgpuPhysicalRect {
            x: 0,
            y: 0,
            width: 64,
            height: 64,
        },
    )
}

pub(super) fn draw_range_operation_with_bounds(
    command_id: &str,
    first_index: u32,
    index_count: u32,
    first_vertex: u32,
    vertex_count: u32,
    physical_bounds: WgpuPhysicalRect,
) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::DrawIndexed {
        pass_label: "pass".to_string(),
        command_id: command_id.to_string(),
        first_index,
        index_count,
        first_vertex,
        vertex_count,
        physical_bounds,
        scissor: None,
    }
}
