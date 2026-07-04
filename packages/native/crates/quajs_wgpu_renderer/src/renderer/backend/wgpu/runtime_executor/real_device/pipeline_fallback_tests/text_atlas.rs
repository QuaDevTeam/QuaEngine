use super::support::{
    command_id, index_buffer_operation, noop_executor, pipeline_descriptor, pipeline_label,
    vertex_buffer_operation,
};
use super::*;

const TEXT_ATLAS_RESOURCE_ID: &str = "glyph-atlas:builtin-bitmap-ascii";

#[test]
fn noop_device_materializes_text_placeholder_with_builtin_text_atlas_bind_group() {
    let mut executor = noop_executor();
    let key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Text,
        shader: WgpuNativeRenderShader::TextPlaceholder,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let operations = vec![
        vertex_buffer_operation(),
        index_buffer_operation(),
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: pipeline_label("text-placeholder"),
            key: key.clone(),
            descriptor: pipeline_descriptor("text-placeholder", key.clone()),
        },
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::text-atlas".to_string(),
            command_id: command_id("text-placeholder"),
            layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
            resource_ids: vec![TEXT_ATLAS_RESOURCE_ID.to_string()],
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
            command_id: command_id("text-placeholder"),
            key: key.clone(),
            cache_label: pipeline_label("text-placeholder"),
        },
        WgpuNativeRenderRuntimeOperation::SetBindGroup {
            pass_label: "pass".to_string(),
            command_id: command_id("text-placeholder"),
            cache_label: "bind-group::text-atlas".to_string(),
            resource_ids: vec![TEXT_ATLAS_RESOURCE_ID.to_string()],
        },
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: command_id("text-placeholder"),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: WgpuPhysicalRect {
                x: 8,
                y: 12,
                width: 36,
                height: 18,
            },
            scissor: None,
        },
        WgpuNativeRenderRuntimeOperation::EndRenderPass {
            pass_label: "pass".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
            encoder_label: "encoder".to_string(),
            pass_count: 1,
            command_count: 6,
        },
    ];
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 5,
        operation_count: operations.len(),
        cache_operation_count: 4,
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 6,
        draw_indexed_count: 1,
        submit_count: 1,
        operations,
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.pipeline_create_count, 1);
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.draw_indexed_count, 1);
    assert_eq!(report.resident_pipeline_count, 1);
    assert_eq!(report.resident_bind_group_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 1);
}
