mod fixture;

use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferRole,
    WgpuNativeRenderPipelineOperation, WgpuNativeRenderPipelinePlan,
    WgpuNativeRenderResourceBindGroup, WgpuNativeRenderShader, WgpuNativeRenderSkippedQuadReason,
};
use fixture::{
    buffer_pass, floats_to_bytes, indices_to_bytes, pipeline_key, pipeline_pass, rect,
    upload_descriptor, vertex,
};

#[test]
fn materializes_upload_bytes_and_draw_batches() {
    let buffer_plan = WgpuNativeRenderBufferPlan {
        revision: 11,
        pass_count: 1,
        vertex_count: 2,
        index_count: 3,
        draw_call_count: 2,
        skipped_quad_count: 1,
        invalid_paint_count: 0,
        shaped_text_draw_count: 0,
        passes: vec![buffer_pass(
            0,
            vec![
                vertex([1.0, 2.0], [0.25, 0.5]),
                vertex([3.0, 4.0], [0.75, 1.0]),
            ],
            vec![0, 1, 0],
        )],
    };
    let solid_key = pipeline_key(
        DrawBatchPipeline::Ui,
        WgpuNativeRenderShader::SolidColor,
        WgpuNativeRenderBindGroupLayout::None,
    );
    let texture_key = pipeline_key(
        DrawBatchPipeline::Image,
        WgpuNativeRenderShader::TexturedQuad,
        WgpuNativeRenderBindGroupLayout::TextureSampler,
    );
    let pipeline_plan = WgpuNativeRenderPipelinePlan {
        revision: 11,
        pass_count: 1,
        operation_count: 9,
        buffer_upload_count: 2,
        pipeline_descriptor_count: 0,
        pipeline_bind_count: 2,
        resource_bind_group_count: 1,
        draw_indexed_count: 2,
        skipped_operation_count: 1,
        pipeline_descriptors: Vec::new(),
        passes: vec![pipeline_pass(
            0,
            vec![
                upload_descriptor(WgpuNativeRenderBufferRole::Vertex, 64, 2),
                upload_descriptor(WgpuNativeRenderBufferRole::Index, 12, 3),
                WgpuNativeRenderPipelineOperation::SetRenderPipeline {
                    command_id: "ui:panel".to_string(),
                    key: solid_key.clone(),
                },
                WgpuNativeRenderPipelineOperation::DrawIndexed {
                    command_id: "ui:panel".to_string(),
                    key: solid_key.clone(),
                    first_index: 0,
                    index_count: 3,
                    first_vertex: 0,
                    vertex_count: 2,
                    physical_bounds: rect(10, 20, 100, 40),
                    scissor: None,
                },
                WgpuNativeRenderPipelineOperation::SetRenderPipeline {
                    command_id: "image:bg".to_string(),
                    key: texture_key.clone(),
                },
                WgpuNativeRenderPipelineOperation::BindResourceGroup {
                    group: WgpuNativeRenderResourceBindGroup {
                        command_id: "image:bg".to_string(),
                        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                        resource_ids: vec![ResourceId::from("images/bg.png")],
                    },
                },
                WgpuNativeRenderPipelineOperation::DrawIndexed {
                    command_id: "image:bg".to_string(),
                    key: texture_key.clone(),
                    first_index: 3,
                    index_count: 3,
                    first_vertex: 2,
                    vertex_count: 2,
                    physical_bounds: rect(0, 0, 1280, 720),
                    scissor: None,
                },
                WgpuNativeRenderPipelineOperation::SkipDraw {
                    command_id: "ui:hidden".to_string(),
                    reason: WgpuNativeRenderSkippedQuadReason::Transparent.to_string(),
                    resource_ids: vec![ResourceId::from("images/hidden.png")],
                    owner_package_id: Some("runtime.menu".to_string()),
                    required_package_ids: vec!["base".to_string()],
                },
                WgpuNativeRenderPipelineOperation::EndRenderPass { pass_index: 0 },
            ],
        )],
    };

    let plan =
        WgpuNativeRenderGpuFramePlan::from_buffer_and_pipeline_plans(&buffer_plan, &pipeline_plan);

    assert_eq!(plan.revision, 11);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.upload_count, 2);
    assert_eq!(plan.upload_byte_len, 76);
    assert_eq!(plan.vertex_upload_byte_len, 64);
    assert_eq!(plan.index_upload_byte_len, 12);
    assert_eq!(plan.draw_batch_count, 2);
    assert_eq!(plan.resource_bind_group_count, 1);
    assert_eq!(plan.skipped_draw_count, 1);

    let pass = &plan.passes[0];
    assert_eq!(pass.uploads[0].staging_byte_offset, 0);
    assert_eq!(pass.uploads[0].buffer_byte_offset, 0);
    assert_eq!(pass.uploads[0].byte_len, 64);
    assert_eq!(pass.uploads[0].element_count, 2);
    assert_eq!(
        pass.uploads[0].descriptor.role,
        WgpuNativeRenderBufferRole::Vertex
    );
    assert_eq!(
        pass.uploads[0].bytes,
        floats_to_bytes(&[
            1.0, 2.0, 0.25, 0.5, 1.0, 1.0, 1.0, 1.0, 3.0, 4.0, 0.75, 1.0, 1.0, 1.0, 1.0, 1.0,
        ])
    );
    assert_eq!(pass.uploads[1].staging_byte_offset, 64);
    assert_eq!(pass.uploads[1].byte_len, 12);
    assert_eq!(
        pass.uploads[1].descriptor.role,
        WgpuNativeRenderBufferRole::Index
    );
    assert_eq!(pass.uploads[1].bytes, indices_to_bytes(&[0, 1, 0]));

    assert_eq!(pass.draw_batches[0].command_id, "ui:panel");
    assert!(pass.draw_batches[0].bind_group.is_none());
    assert_eq!(pass.draw_batches[1].command_id, "image:bg");
    assert_eq!(
        pass.draw_batches[1]
            .bind_group
            .as_ref()
            .expect("expected texture bind group")
            .resource_ids,
        vec![ResourceId::from("images/bg.png")]
    );
    assert_eq!(pass.skipped_draws[0].command_id, "ui:hidden");
    assert_eq!(pass.skipped_draws[0].reason, "transparent");
    assert_eq!(
        pass.skipped_draws[0].owner_package_id.as_deref(),
        Some("runtime.menu")
    );
    assert_eq!(
        pass.skipped_draws[0].required_package_ids,
        vec!["base".to_string()]
    );
}

#[test]
fn keeps_staging_offsets_unique_across_passes() {
    let buffer_plan = WgpuNativeRenderBufferPlan {
        revision: 12,
        pass_count: 2,
        vertex_count: 3,
        index_count: 3,
        draw_call_count: 0,
        skipped_quad_count: 0,
        invalid_paint_count: 0,
        shaped_text_draw_count: 0,
        passes: vec![
            buffer_pass(0, vec![vertex([0.0, 0.0], [0.0, 0.0])], vec![0]),
            buffer_pass(
                1,
                vec![
                    vertex([1.0, 1.0], [1.0, 1.0]),
                    vertex([2.0, 2.0], [1.0, 0.0]),
                ],
                vec![0, 1],
            ),
        ],
    };
    let pipeline_plan = WgpuNativeRenderPipelinePlan {
        revision: 12,
        pass_count: 2,
        operation_count: 4,
        buffer_upload_count: 4,
        pipeline_descriptor_count: 0,
        pipeline_bind_count: 0,
        resource_bind_group_count: 0,
        draw_indexed_count: 0,
        skipped_operation_count: 0,
        pipeline_descriptors: Vec::new(),
        passes: vec![
            pipeline_pass(
                0,
                vec![
                    upload_descriptor(WgpuNativeRenderBufferRole::Vertex, 32, 1),
                    upload_descriptor(WgpuNativeRenderBufferRole::Index, 4, 1),
                ],
            ),
            pipeline_pass(
                1,
                vec![
                    upload_descriptor(WgpuNativeRenderBufferRole::Vertex, 64, 2),
                    upload_descriptor(WgpuNativeRenderBufferRole::Index, 8, 2),
                ],
            ),
        ],
    };

    let plan =
        WgpuNativeRenderGpuFramePlan::from_buffer_and_pipeline_plans(&buffer_plan, &pipeline_plan);

    assert_eq!(plan.upload_byte_len, 108);
    assert_eq!(
        plan.passes
            .iter()
            .flat_map(|pass| pass.uploads.iter())
            .map(|upload| upload.staging_byte_offset)
            .collect::<Vec<_>>(),
        vec![0, 32, 36, 100]
    );
}
