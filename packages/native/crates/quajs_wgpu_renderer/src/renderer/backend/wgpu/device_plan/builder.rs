use super::super::submission_plan::{
    WgpuNativeRenderSubmissionCommand, WgpuNativeRenderSubmissionPass,
    WgpuNativeRenderSubmissionPlan,
};
use super::{
    WgpuNativeRenderCommandEncoderPlan, WgpuNativeRenderDeviceBindGroupCacheRequest,
    WgpuNativeRenderDeviceBuffer, WgpuNativeRenderDeviceCommand,
    WgpuNativeRenderDevicePipelineCacheRequest, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderDeviceQueueWrite, WgpuNativeRenderDeviceRenderPass,
    WgpuNativeRenderDeviceStagingBuffer,
};

impl WgpuNativeRenderDevicePlan {
    pub fn from_submission_plan(submission_plan: &WgpuNativeRenderSubmissionPlan) -> Self {
        let staging_buffer = staging_buffer(submission_plan);
        let gpu_buffers = submission_plan
            .gpu_buffers
            .iter()
            .map(|allocation| WgpuNativeRenderDeviceBuffer {
                label: allocation.label.clone(),
                descriptor: allocation.descriptor.clone(),
                byte_len: allocation.byte_len,
            })
            .collect::<Vec<_>>();
        let queue_writes = queue_writes(submission_plan);
        let pipeline_cache_requests = submission_plan
            .pipeline_cache_entries
            .iter()
            .map(|entry| WgpuNativeRenderDevicePipelineCacheRequest {
                cache_label: entry.cache_label.clone(),
                key: entry.key.clone(),
                descriptor: entry.descriptor.clone(),
            })
            .collect::<Vec<_>>();
        let bind_group_cache_requests = submission_plan
            .bind_group_cache_entries
            .iter()
            .map(|entry| WgpuNativeRenderDeviceBindGroupCacheRequest {
                cache_label: entry.cache_label.clone(),
                command_id: entry.group.command_id.clone(),
                layout: entry.group.layout,
                resource_ids: entry.group.resource_ids.clone(),
            })
            .collect::<Vec<_>>();
        let command_encoders = command_encoders(submission_plan);
        let render_pass_command_count = command_encoders
            .iter()
            .flat_map(|encoder| encoder.render_passes.iter())
            .map(|pass| pass.command_count)
            .sum();

        Self {
            revision: submission_plan.revision,
            staging_buffer_byte_len: submission_plan.staging_buffer_byte_len,
            gpu_buffer_count: gpu_buffers.len(),
            gpu_buffer_byte_len: gpu_buffers.iter().map(|buffer| buffer.byte_len).sum(),
            queue_write_count: queue_writes.len(),
            queue_write_byte_len: queue_writes.iter().map(|write| write.byte_len).sum(),
            pipeline_cache_request_count: pipeline_cache_requests.len(),
            bind_group_cache_request_count: bind_group_cache_requests.len(),
            command_encoder_count: command_encoders.len(),
            render_pass_count: submission_plan.render_pass_count,
            render_pass_command_count,
            draw_indexed_count: submission_plan.draw_call_count,
            skipped_draw_count: submission_plan.skipped_draw_count,
            staging_buffer,
            gpu_buffers,
            queue_writes,
            pipeline_cache_requests,
            bind_group_cache_requests,
            command_encoders,
        }
    }
}

fn staging_buffer(
    submission_plan: &WgpuNativeRenderSubmissionPlan,
) -> Option<WgpuNativeRenderDeviceStagingBuffer> {
    (submission_plan.staging_buffer.byte_len > 0).then(|| WgpuNativeRenderDeviceStagingBuffer {
        label: submission_plan.staging_buffer.label.clone(),
        byte_len: submission_plan.staging_buffer.byte_len,
        upload_count: submission_plan.staging_buffer.upload_count,
    })
}

fn queue_writes(
    submission_plan: &WgpuNativeRenderSubmissionPlan,
) -> Vec<WgpuNativeRenderDeviceQueueWrite> {
    submission_plan
        .queue_writes
        .iter()
        .map(|write| WgpuNativeRenderDeviceQueueWrite {
            staging_label: submission_plan.staging_buffer.label.clone(),
            target_label: write.target_label.clone(),
            staging_byte_offset: write.staging_byte_offset,
            buffer_byte_offset: write.buffer_byte_offset,
            byte_len: write.byte_len,
            checksum: write.checksum,
            bytes: write.bytes.clone(),
        })
        .collect()
}

fn command_encoders(
    submission_plan: &WgpuNativeRenderSubmissionPlan,
) -> Vec<WgpuNativeRenderCommandEncoderPlan> {
    let render_passes = submission_plan
        .render_passes
        .iter()
        .map(render_pass)
        .collect::<Vec<_>>();

    vec![WgpuNativeRenderCommandEncoderPlan {
        label: command_encoder_label(submission_plan.revision),
        pass_count: render_passes.len(),
        command_count: render_passes.iter().map(|pass| pass.command_count).sum(),
        render_passes,
    }]
}

fn render_pass(pass: &WgpuNativeRenderSubmissionPass) -> WgpuNativeRenderDeviceRenderPass {
    let label = render_pass_label(pass.pass_index);
    let mut commands = vec![WgpuNativeRenderDeviceCommand::BeginRenderPass {
        label: label.clone(),
        viewport: pass.viewport,
    }];
    commands.extend(pass.commands.iter().map(device_command));
    commands.push(WgpuNativeRenderDeviceCommand::EndRenderPass {
        label: label.clone(),
    });

    WgpuNativeRenderDeviceRenderPass {
        label,
        pass_index: pass.pass_index,
        plane: pass.plane,
        viewport: pass.viewport,
        command_count: commands.len(),
        draw_indexed_count: pass.draw_count,
        skipped_draw_count: pass.skipped_draw_count,
        commands,
    }
}

fn device_command(command: &WgpuNativeRenderSubmissionCommand) -> WgpuNativeRenderDeviceCommand {
    match command {
        WgpuNativeRenderSubmissionCommand::SetViewport { viewport } => {
            WgpuNativeRenderDeviceCommand::SetViewport {
                viewport: *viewport,
            }
        }
        WgpuNativeRenderSubmissionCommand::SetVertexBuffer {
            buffer_label,
            byte_len,
        } => WgpuNativeRenderDeviceCommand::SetVertexBuffer {
            buffer_label: buffer_label.clone(),
            byte_len: *byte_len,
        },
        WgpuNativeRenderSubmissionCommand::SetIndexBuffer {
            buffer_label,
            byte_len,
        } => WgpuNativeRenderDeviceCommand::SetIndexBuffer {
            buffer_label: buffer_label.clone(),
            byte_len: *byte_len,
        },
        WgpuNativeRenderSubmissionCommand::SetPipeline {
            command_id,
            key,
            cache_label,
        } => WgpuNativeRenderDeviceCommand::SetPipeline {
            command_id: command_id.clone(),
            key: key.clone(),
            cache_label: cache_label.clone(),
        },
        WgpuNativeRenderSubmissionCommand::SetBindGroup {
            command_id,
            cache_label,
            resource_ids,
        } => WgpuNativeRenderDeviceCommand::SetBindGroup {
            command_id: command_id.clone(),
            cache_label: cache_label.clone(),
            resource_ids: resource_ids.clone(),
        },
        WgpuNativeRenderSubmissionCommand::DrawIndexed {
            command_id,
            first_index,
            index_count,
            first_vertex,
            vertex_count,
            physical_bounds,
            scissor,
        } => WgpuNativeRenderDeviceCommand::DrawIndexed {
            command_id: command_id.clone(),
            first_index: *first_index,
            index_count: *index_count,
            first_vertex: *first_vertex,
            vertex_count: *vertex_count,
            physical_bounds: *physical_bounds,
            scissor: *scissor,
        },
        WgpuNativeRenderSubmissionCommand::SkipDraw {
            command_id,
            reason,
            resource_ids,
            owner_package_id,
            required_package_ids,
        } => WgpuNativeRenderDeviceCommand::SkipDraw {
            command_id: command_id.clone(),
            reason: reason.clone(),
            resource_ids: resource_ids.clone(),
            owner_package_id: owner_package_id.clone(),
            required_package_ids: required_package_ids.clone(),
        },
    }
}

fn command_encoder_label(revision: u64) -> String {
    format!("qua-native::wgpu::frame-{revision}::command-encoder")
}

fn render_pass_label(pass_index: usize) -> String {
    format!("qua-native::wgpu::pass-{pass_index}::render-pass")
}
