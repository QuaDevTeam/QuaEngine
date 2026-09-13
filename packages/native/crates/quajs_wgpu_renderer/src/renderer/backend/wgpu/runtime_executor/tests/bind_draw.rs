use super::common::*;
use super::*;

mod bind_group;
mod draw_state;
mod release_guards;

fn apply_queued_draw_setup(
    device: &mut InMemoryWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
) {
    let pipeline_request = pipeline("pipeline::ui", DrawBatchPipeline::Ui);
    let replacement_pipeline = pipeline("pipeline::image", DrawBatchPipeline::Image);
    apply_setup_operations(
        device,
        report,
        vec![
            create_buffer_operation(
                "vertex::first",
                WgpuNativeRenderBufferRole::Vertex,
                QUAD_VERTEX_BYTE_LEN,
            ),
            create_buffer_operation(
                "vertex::second",
                WgpuNativeRenderBufferRole::Vertex,
                QUAD_VERTEX_BYTE_LEN,
            ),
            create_buffer_operation("index", WgpuNativeRenderBufferRole::Index, 24),
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: pipeline_request.cache_label.clone(),
                key: pipeline_request.key.clone(),
                descriptor: pipeline_request.descriptor.clone(),
            },
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: replacement_pipeline.cache_label.clone(),
                key: replacement_pipeline.key.clone(),
                descriptor: replacement_pipeline.descriptor.clone(),
            },
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::ui".to_string(),
                command_id: "ui:button".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:button.png".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::replacement".to_string(),
                command_id: "ui:replacement".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:replacement.png".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 8,
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
                command_count: 8,
            },
            WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex::first".to_string(),
                byte_len: QUAD_VERTEX_BYTE_LEN,
            },
            WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
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
            draw_indexed_operation("ui:button"),
        ],
    );
}
