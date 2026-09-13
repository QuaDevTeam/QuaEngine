use super::super::*;
use super::support::{checksum, gpu_buffer, pipeline_descriptor, pipeline_key, queue_write, rect};
use crate::render_graph::RenderPlane;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupCacheEntry, WgpuNativeRenderBindGroupLayout,
    WgpuNativeRenderBufferRole, WgpuNativeRenderPipelineCacheEntry,
    WgpuNativeRenderResourceBindGroup, WgpuNativeRenderStagingBufferPlan,
    WgpuNativeRenderSubmissionCommand, WgpuNativeRenderSubmissionPass,
    WgpuNativeRenderSubmissionPlan,
};
use crate::resources::ResourceId;

#[test]
fn materializes_device_encoder_and_cache_plan_from_submission() {
    let key = pipeline_key();
    let descriptor = pipeline_descriptor(key.clone());
    let draw_scissor = rect(24, 28, 144, 96);
    let submission = WgpuNativeRenderSubmissionPlan {
        revision: 11,
        pass_count: 1,
        staging_buffer_byte_len: 64,
        gpu_buffer_count: 2,
        gpu_buffer_byte_len: 64,
        queue_write_count: 2,
        queue_write_byte_len: 64,
        pipeline_cache_entry_count: 1,
        bind_group_cache_entry_count: 1,
        render_pass_count: 1,
        draw_call_count: 1,
        skipped_draw_count: 1,
        staging_buffer: WgpuNativeRenderStagingBufferPlan {
            label: "staging".to_string(),
            byte_len: 64,
            upload_count: 2,
        },
        gpu_buffers: vec![
            gpu_buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 48),
            gpu_buffer("index", WgpuNativeRenderBufferRole::Index, 16),
        ],
        queue_writes: vec![
            queue_write("vertex", 0, 48, 101),
            queue_write("index", 48, 16, 202),
        ],
        pipeline_cache_entries: vec![WgpuNativeRenderPipelineCacheEntry {
            key: key.clone(),
            descriptor,
            cache_label: "pipeline::ui".to_string(),
        }],
        bind_group_cache_entries: vec![WgpuNativeRenderBindGroupCacheEntry {
            cache_label: "bind-group::atlas".to_string(),
            group: WgpuNativeRenderResourceBindGroup {
                command_id: "ui:portrait".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec![ResourceId::from("images:portrait.png")],
            },
        }],
        render_passes: vec![WgpuNativeRenderSubmissionPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
            draw_count: 1,
            skipped_draw_count: 1,
            commands: vec![
                WgpuNativeRenderSubmissionCommand::SetViewport {
                    viewport: rect(0, 0, 1280, 720),
                },
                WgpuNativeRenderSubmissionCommand::SetVertexBuffer {
                    buffer_label: "vertex".to_string(),
                    byte_len: 48,
                },
                WgpuNativeRenderSubmissionCommand::SetIndexBuffer {
                    buffer_label: "index".to_string(),
                    byte_len: 16,
                },
                WgpuNativeRenderSubmissionCommand::SetPipeline {
                    command_id: "ui:portrait".to_string(),
                    key: key.clone(),
                    cache_label: "pipeline::ui".to_string(),
                },
                WgpuNativeRenderSubmissionCommand::SetBindGroup {
                    command_id: "ui:portrait".to_string(),
                    cache_label: "bind-group::atlas".to_string(),
                    resource_ids: vec![ResourceId::from("images:portrait.png")],
                },
                WgpuNativeRenderSubmissionCommand::DrawIndexed {
                    command_id: "ui:portrait".to_string(),
                    first_index: 0,
                    index_count: 6,
                    first_vertex: 0,
                    vertex_count: 4,
                    physical_bounds: rect(20, 20, 160, 120),
                    scissor: Some(draw_scissor),
                },
                WgpuNativeRenderSubmissionCommand::SkipDraw {
                    command_id: "ui:hidden".to_string(),
                    reason: "transparent".to_string(),
                    resource_ids: vec![ResourceId::from("images:hidden.png")],
                    owner_package_id: Some("runtime.menu".to_string()),
                    required_package_ids: vec!["base".to_string()],
                },
            ],
        }],
    };

    let plan = WgpuNativeRenderDevicePlan::from_submission_plan(&submission);

    assert_eq!(plan.revision, 11);
    assert_eq!(plan.staging_buffer_byte_len, 64);
    assert_eq!(plan.gpu_buffer_count, 2);
    assert_eq!(plan.gpu_buffer_byte_len, 64);
    assert_eq!(plan.queue_write_count, 2);
    assert_eq!(plan.queue_write_byte_len, 64);
    assert_eq!(plan.pipeline_cache_request_count, 1);
    assert_eq!(plan.bind_group_cache_request_count, 1);
    assert_eq!(plan.command_encoder_count, 1);
    assert_eq!(plan.render_pass_count, 1);
    assert_eq!(plan.render_pass_command_count, 9);
    assert_eq!(plan.draw_indexed_count, 1);
    assert_eq!(plan.skipped_draw_count, 1);
    assert_eq!(plan.staging_buffer.as_ref().unwrap().label, "staging");
    assert_eq!(plan.queue_writes[0].staging_label, "staging");
    assert_eq!(plan.queue_writes[0].target_label, "vertex");
    assert_eq!(plan.queue_writes[1].bytes.len(), 16);
    assert_eq!(
        plan.queue_writes[1].checksum,
        checksum(&plan.queue_writes[1].bytes)
    );
    assert_eq!(plan.pipeline_cache_requests[0].cache_label, "pipeline::ui");
    assert_eq!(
        plan.bind_group_cache_requests[0].resource_ids,
        vec![ResourceId::from("images:portrait.png")]
    );
    assert_eq!(
        plan.command_encoders[0].label,
        "qua-native::wgpu::frame-11::command-encoder"
    );

    let render_pass = &plan.command_encoders[0].render_passes[0];
    assert_eq!(render_pass.label, "qua-native::wgpu::pass-0::render-pass");
    assert!(matches!(
        render_pass.commands.first(),
        Some(WgpuNativeRenderDeviceCommand::BeginRenderPass { .. })
    ));
    assert!(matches!(
        render_pass.commands.last(),
        Some(WgpuNativeRenderDeviceCommand::EndRenderPass { .. })
    ));
    assert!(render_pass.commands.iter().any(|command| matches!(
        command,
        WgpuNativeRenderDeviceCommand::SetPipeline {
            command_id,
            cache_label,
            ..
        } if command_id == "ui:portrait" && cache_label == "pipeline::ui"
    )));
    let draw_scissor_from_device = render_pass
        .commands
        .iter()
        .find_map(|command| match command {
            WgpuNativeRenderDeviceCommand::DrawIndexed {
                command_id,
                index_count: 6,
                scissor,
                ..
            } if command_id == "ui:portrait" => Some(scissor),
            _ => None,
        })
        .expect("expected portrait draw indexed command");
    assert_eq!(*draw_scissor_from_device, Some(draw_scissor));
    assert!(render_pass.commands.iter().any(|command| matches!(
        command,
        WgpuNativeRenderDeviceCommand::SkipDraw {
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
