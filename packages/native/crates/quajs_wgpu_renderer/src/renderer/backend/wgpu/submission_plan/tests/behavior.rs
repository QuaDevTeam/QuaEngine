use super::support::{pipeline_descriptor, pipeline_key, rect, upload};
use super::*;

#[test]
fn derives_submission_resources_and_render_pass_commands() {
    let texture_key = pipeline_key(
        DrawBatchPipeline::Image,
        WgpuNativeRenderShader::TexturedQuad,
        WgpuNativeRenderBindGroupLayout::TextureSampler,
    );
    let ui_key = pipeline_key(
        DrawBatchPipeline::Ui,
        WgpuNativeRenderShader::SolidColor,
        WgpuNativeRenderBindGroupLayout::None,
    );
    let frame = WgpuNativeRenderGpuFramePlan {
        revision: 9,
        pass_count: 1,
        upload_count: 2,
        upload_byte_len: 28,
        vertex_upload_byte_len: 16,
        index_upload_byte_len: 12,
        pipeline_descriptor_count: 2,
        resource_bind_group_count: 1,
        draw_batch_count: 2,
        skipped_draw_count: 1,
        pipeline_descriptors: vec![
            pipeline_descriptor(texture_key.clone()),
            pipeline_descriptor(ui_key.clone()),
        ],
        passes: vec![WgpuNativeRenderGpuFramePass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
            upload_byte_len: 28,
            vertex_upload_byte_len: 16,
            index_upload_byte_len: 12,
            resource_bind_group_count: 1,
            draw_batch_count: 2,
            skipped_draw_count: 1,
            uploads: vec![
                upload(WgpuNativeRenderBufferRole::Vertex, 0, 16, vec![1, 2, 3, 4]),
                upload(WgpuNativeRenderBufferRole::Index, 16, 12, vec![5, 6, 7, 8]),
            ],
            draw_batches: vec![
                WgpuNativeRenderGpuDrawBatch {
                    command_id: "image:bg".to_string(),
                    key: texture_key.clone(),
                    bind_group: Some(WgpuNativeRenderResourceBindGroup {
                        command_id: "image:bg".to_string(),
                        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                        resource_ids: vec![ResourceId::from("images:bg.png")],
                    }),
                    first_index: 0,
                    index_count: 6,
                    first_vertex: 0,
                    vertex_count: 4,
                    physical_bounds: rect(0, 0, 1280, 720),
                    scissor: None,
                },
                WgpuNativeRenderGpuDrawBatch {
                    command_id: "ui:panel".to_string(),
                    key: ui_key.clone(),
                    bind_group: None,
                    first_index: 6,
                    index_count: 6,
                    first_vertex: 4,
                    vertex_count: 4,
                    physical_bounds: rect(20, 20, 200, 80),
                    scissor: None,
                },
            ],
            skipped_draws: vec![WgpuNativeRenderGpuSkippedDraw {
                command_id: "ui:hidden".to_string(),
                reason: "transparent".to_string(),
                resource_ids: vec![ResourceId::from("images:hidden.png")],
                owner_package_id: Some("runtime.menu".to_string()),
                required_package_ids: vec!["base".to_string()],
            }],
        }],
    };

    let plan = WgpuNativeRenderSubmissionPlan::from_gpu_frame_plan(&frame);

    assert_eq!(plan.revision, 9);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.staging_buffer.byte_len, 28);
    assert_eq!(plan.staging_buffer.upload_count, 2);
    assert_eq!(plan.gpu_buffer_count, 2);
    assert_eq!(plan.gpu_buffer_byte_len, 28);
    assert_eq!(plan.queue_write_count, 2);
    assert_eq!(plan.queue_write_byte_len, 28);
    assert_eq!(plan.pipeline_cache_entry_count, 2);
    assert_eq!(plan.bind_group_cache_entry_count, 1);
    assert_eq!(plan.render_pass_count, 1);
    assert_eq!(plan.draw_call_count, 2);
    assert_eq!(plan.skipped_draw_count, 1);
    assert_eq!(
        plan.queue_writes
            .iter()
            .map(|write| (
                &write.target_label,
                write.staging_byte_offset,
                write.byte_len
            ))
            .collect::<Vec<_>>(),
        vec![
            (
                &"qua-native::wgpu::pass-0::vertex-buffer".to_string(),
                0,
                16
            ),
            (
                &"qua-native::wgpu::pass-0::index-buffer".to_string(),
                16,
                12
            ),
        ]
    );
    assert_ne!(plan.queue_writes[0].checksum, plan.queue_writes[1].checksum);
    assert!(plan
        .pipeline_cache_entries
        .iter()
        .any(|entry| entry.key == texture_key));
    assert_eq!(
        plan.bind_group_cache_entries[0].cache_label,
        "qua-native::wgpu::bind-group::TextureSampler::images:bg.png"
    );

    let pass = &plan.render_passes[0];
    assert_eq!(pass.draw_count, 2);
    assert_eq!(pass.skipped_draw_count, 1);
    assert!(matches!(
        pass.commands[0],
        WgpuNativeRenderSubmissionCommand::SetViewport { .. }
    ));
    assert!(matches!(
        pass.commands[1],
        WgpuNativeRenderSubmissionCommand::SetVertexBuffer { .. }
    ));
    assert!(matches!(
        pass.commands[2],
        WgpuNativeRenderSubmissionCommand::SetIndexBuffer { .. }
    ));
    assert!(pass.commands.iter().any(|command| matches!(
        command,
        WgpuNativeRenderSubmissionCommand::SetBindGroup {
            command_id,
            resource_ids,
            ..
        } if command_id == "image:bg" && resource_ids == &vec![ResourceId::from("images:bg.png")]
    )));
    assert!(pass.commands.iter().any(|command| matches!(
        command,
        WgpuNativeRenderSubmissionCommand::DrawIndexed {
            command_id,
            index_count: 6,
            ..
        } if command_id == "ui:panel"
    )));
    assert!(pass.commands.iter().any(|command| matches!(
        command,
        WgpuNativeRenderSubmissionCommand::SkipDraw {
            command_id,
            reason,
            owner_package_id,
            required_package_ids,
            ..
        } if command_id == "ui:hidden"
            && reason == "transparent"
            && owner_package_id.as_deref() == Some("runtime.menu")
            && required_package_ids == &vec!["base".to_string()]
    )));
}
