use std::collections::BTreeMap;

use super::super::gpu_frame::{WgpuNativeRenderGpuFramePass, WgpuNativeRenderGpuFramePlan};
use super::super::pipeline::{
    WgpuNativeRenderBufferRole, WgpuNativeRenderPipelineKey, WgpuNativeRenderResourceBindGroup,
};
use super::{
    WgpuNativeRenderBindGroupCacheEntry, WgpuNativeRenderGpuBufferAllocation,
    WgpuNativeRenderPipelineCacheEntry, WgpuNativeRenderQueueWrite,
    WgpuNativeRenderStagingBufferPlan, WgpuNativeRenderSubmissionCommand,
    WgpuNativeRenderSubmissionPass, WgpuNativeRenderSubmissionPlan,
};

impl WgpuNativeRenderSubmissionPlan {
    pub fn from_gpu_frame_plan(frame_plan: &WgpuNativeRenderGpuFramePlan) -> Self {
        let gpu_buffers = gpu_buffer_allocations(frame_plan);
        let queue_writes = queue_writes(frame_plan);
        let pipeline_cache_entries = pipeline_cache_entries(frame_plan);
        let bind_group_cache_entries = bind_group_cache_entries(frame_plan);
        let render_passes = frame_plan
            .passes
            .iter()
            .map(submission_pass)
            .collect::<Vec<_>>();

        Self {
            revision: frame_plan.revision,
            pass_count: frame_plan.pass_count,
            staging_buffer_byte_len: frame_plan.upload_byte_len,
            gpu_buffer_count: gpu_buffers.len(),
            gpu_buffer_byte_len: gpu_buffers
                .iter()
                .map(|allocation| allocation.byte_len)
                .sum(),
            queue_write_count: queue_writes.len(),
            queue_write_byte_len: queue_writes.iter().map(|write| write.byte_len).sum(),
            pipeline_cache_entry_count: pipeline_cache_entries.len(),
            bind_group_cache_entry_count: bind_group_cache_entries.len(),
            render_pass_count: render_passes.len(),
            draw_call_count: render_passes.iter().map(|pass| pass.draw_count).sum(),
            skipped_draw_count: render_passes
                .iter()
                .map(|pass| pass.skipped_draw_count)
                .sum(),
            staging_buffer: WgpuNativeRenderStagingBufferPlan {
                label: staging_buffer_label(frame_plan.revision),
                byte_len: frame_plan.upload_byte_len,
                upload_count: frame_plan.upload_count,
            },
            gpu_buffers,
            queue_writes,
            pipeline_cache_entries,
            bind_group_cache_entries,
            render_passes,
        }
    }
}

fn gpu_buffer_allocations(
    frame_plan: &WgpuNativeRenderGpuFramePlan,
) -> Vec<WgpuNativeRenderGpuBufferAllocation> {
    frame_plan
        .passes
        .iter()
        .flat_map(|pass| pass.uploads.iter())
        .map(|upload| WgpuNativeRenderGpuBufferAllocation {
            label: gpu_buffer_label(upload.pass_index, upload.descriptor.role),
            descriptor: upload.descriptor.clone(),
            byte_len: upload.byte_len,
        })
        .collect()
}

fn queue_writes(frame_plan: &WgpuNativeRenderGpuFramePlan) -> Vec<WgpuNativeRenderQueueWrite> {
    frame_plan
        .passes
        .iter()
        .flat_map(|pass| pass.uploads.iter())
        .map(|upload| WgpuNativeRenderQueueWrite {
            target_label: gpu_buffer_label(upload.pass_index, upload.descriptor.role),
            staging_byte_offset: upload.staging_byte_offset,
            buffer_byte_offset: upload.buffer_byte_offset,
            byte_len: upload.byte_len,
            checksum: checksum(&upload.bytes),
            bytes: upload.bytes.clone(),
        })
        .collect()
}

fn pipeline_cache_entries(
    frame_plan: &WgpuNativeRenderGpuFramePlan,
) -> Vec<WgpuNativeRenderPipelineCacheEntry> {
    frame_plan
        .pipeline_descriptors
        .iter()
        .map(|descriptor| WgpuNativeRenderPipelineCacheEntry {
            key: descriptor.key.clone(),
            cache_label: pipeline_cache_label(&descriptor.key),
            descriptor: descriptor.clone(),
        })
        .collect()
}

fn bind_group_cache_entries(
    frame_plan: &WgpuNativeRenderGpuFramePlan,
) -> Vec<WgpuNativeRenderBindGroupCacheEntry> {
    let mut groups = BTreeMap::<String, WgpuNativeRenderResourceBindGroup>::new();
    for group in frame_plan
        .passes
        .iter()
        .flat_map(|pass| pass.draw_batches.iter())
        .filter_map(|batch| batch.bind_group.as_ref())
    {
        groups
            .entry(bind_group_cache_label(group))
            .or_insert_with(|| group.clone());
    }

    groups
        .into_iter()
        .map(|(cache_label, group)| WgpuNativeRenderBindGroupCacheEntry { cache_label, group })
        .collect()
}

fn submission_pass(pass: &WgpuNativeRenderGpuFramePass) -> WgpuNativeRenderSubmissionPass {
    let mut commands = vec![WgpuNativeRenderSubmissionCommand::SetViewport {
        viewport: pass.viewport,
    }];
    if let Some(vertex_upload) = pass
        .uploads
        .iter()
        .find(|upload| upload.descriptor.role == WgpuNativeRenderBufferRole::Vertex)
    {
        commands.push(WgpuNativeRenderSubmissionCommand::SetVertexBuffer {
            buffer_label: gpu_buffer_label(vertex_upload.pass_index, vertex_upload.descriptor.role),
            byte_len: vertex_upload.byte_len,
        });
    }
    if let Some(index_upload) = pass
        .uploads
        .iter()
        .find(|upload| upload.descriptor.role == WgpuNativeRenderBufferRole::Index)
    {
        commands.push(WgpuNativeRenderSubmissionCommand::SetIndexBuffer {
            buffer_label: gpu_buffer_label(index_upload.pass_index, index_upload.descriptor.role),
            byte_len: index_upload.byte_len,
        });
    }

    for batch in &pass.draw_batches {
        commands.push(WgpuNativeRenderSubmissionCommand::SetPipeline {
            command_id: batch.command_id.clone(),
            key: batch.key.clone(),
            cache_label: pipeline_cache_label(&batch.key),
        });
        if let Some(group) = &batch.bind_group {
            commands.push(WgpuNativeRenderSubmissionCommand::SetBindGroup {
                command_id: batch.command_id.clone(),
                cache_label: bind_group_cache_label(group),
                resource_ids: group.resource_ids.clone(),
            });
        }
        commands.push(WgpuNativeRenderSubmissionCommand::DrawIndexed {
            command_id: batch.command_id.clone(),
            first_index: batch.first_index,
            index_count: batch.index_count,
            first_vertex: batch.first_vertex,
            vertex_count: batch.vertex_count,
            physical_bounds: batch.physical_bounds,
            scissor: batch.scissor,
        });
    }

    for skipped_draw in &pass.skipped_draws {
        commands.push(WgpuNativeRenderSubmissionCommand::SkipDraw {
            command_id: skipped_draw.command_id.clone(),
            reason: skipped_draw.reason.clone(),
            resource_ids: skipped_draw.resource_ids.clone(),
            owner_package_id: skipped_draw.owner_package_id.clone(),
            required_package_ids: skipped_draw.required_package_ids.clone(),
        });
    }

    WgpuNativeRenderSubmissionPass {
        pass_index: pass.pass_index,
        plane: pass.plane,
        viewport: pass.viewport,
        draw_count: pass.draw_batch_count,
        skipped_draw_count: pass.skipped_draw_count,
        commands,
    }
}

fn staging_buffer_label(revision: u64) -> String {
    format!("qua-native::wgpu::frame-{revision}::staging")
}

fn gpu_buffer_label(pass_index: usize, role: WgpuNativeRenderBufferRole) -> String {
    let role = match role {
        WgpuNativeRenderBufferRole::Vertex => "vertex",
        WgpuNativeRenderBufferRole::Index => "index",
    };
    format!("qua-native::wgpu::pass-{pass_index}::{role}-buffer")
}

fn pipeline_cache_label(key: &WgpuNativeRenderPipelineKey) -> String {
    format!(
        "qua-native::wgpu::pipeline::{:?}::{:?}::{:?}::{:?}",
        key.pipeline, key.shader, key.bind_group_layout, key.blend
    )
}

fn bind_group_cache_label(group: &WgpuNativeRenderResourceBindGroup) -> String {
    format!(
        "qua-native::wgpu::bind-group::{:?}::{}",
        group.layout,
        group
            .resource_ids
            .iter()
            .map(|resource_id| resource_id.as_str())
            .collect::<Vec<_>>()
            .join("|")
    )
}

fn checksum(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}
