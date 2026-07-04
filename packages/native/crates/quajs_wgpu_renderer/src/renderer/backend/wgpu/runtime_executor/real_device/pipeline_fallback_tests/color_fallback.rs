use super::support::{
    command_id, index_buffer_operation, noop_executor, pipeline_descriptor, pipeline_label,
    vertex_buffer_operation,
};
use super::*;

#[test]
fn noop_device_materializes_no_bind_group_color_fallback_pipelines() {
    let mut executor = noop_executor();
    let fallback_pipelines = [
        (
            "clear",
            WgpuNativeRenderPipelineKey {
                pipeline: DrawBatchPipeline::Clear,
                shader: WgpuNativeRenderShader::Clear,
                bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
                blend: WgpuNativeRenderBlendMode::Replace,
            },
        ),
        (
            "clip",
            WgpuNativeRenderPipelineKey {
                pipeline: DrawBatchPipeline::Clip,
                shader: WgpuNativeRenderShader::ClipMask,
                bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
                blend: WgpuNativeRenderBlendMode::Alpha,
            },
        ),
        (
            "custom",
            WgpuNativeRenderPipelineKey {
                pipeline: DrawBatchPipeline::Custom,
                shader: WgpuNativeRenderShader::CustomFallback,
                bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
                blend: WgpuNativeRenderBlendMode::Alpha,
            },
        ),
    ];
    let mut operations = vec![vertex_buffer_operation(), index_buffer_operation()];
    operations.extend(fallback_pipelines.iter().map(|(label, key)| {
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: pipeline_label(label),
            key: key.clone(),
            descriptor: pipeline_descriptor(label, key.clone()),
        }
    }));
    operations.extend([
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
            label: "encoder".to_string(),
            pass_count: 1,
            command_count: 10,
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
            command_count: 10,
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
    ]);
    for (index, (label, key)) in fallback_pipelines.iter().enumerate() {
        operations.push(WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: "pass".to_string(),
            command_id: command_id(label),
            key: key.clone(),
            cache_label: pipeline_label(label),
        });
        operations.push(WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: "pass".to_string(),
            command_id: command_id(label),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: WgpuPhysicalRect {
                x: 4 + index as u32 * 12,
                y: 4 + index as u32 * 12,
                width: 16,
                height: 16,
            },
            scissor: None,
        });
    }
    operations.extend([
        WgpuNativeRenderRuntimeOperation::EndRenderPass {
            pass_label: "pass".to_string(),
        },
        WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
            encoder_label: "encoder".to_string(),
            pass_count: 1,
            command_count: 10,
        },
    ]);

    let plan = WgpuNativeRenderRuntimePlan {
        revision: 4,
        operation_count: operations.len(),
        cache_operation_count: 5,
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 10,
        draw_indexed_count: fallback_pipelines.len(),
        submit_count: 1,
        operations,
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.pipeline_create_count, fallback_pipelines.len());
    assert_eq!(report.bind_group_create_count, 0);
    assert_eq!(report.draw_indexed_count, fallback_pipelines.len());
    assert_eq!(report.resident_pipeline_count, fallback_pipelines.len());
    assert_eq!(report.resident_bind_group_count, 0);
    assert_eq!(report.submitted_command_buffer_count, 1);
}
