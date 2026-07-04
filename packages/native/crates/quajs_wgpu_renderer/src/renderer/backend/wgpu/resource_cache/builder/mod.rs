mod entries;
mod releases;
mod status;

use super::super::device_plan::WgpuNativeRenderDevicePlan;
use super::{WgpuNativeRenderCacheEntryStatus, WgpuNativeRenderResourceCachePlan};
use entries::{bind_group_entries, buffer_entries, pipeline_entries};
use releases::{released_bind_groups, released_buffers, released_pipelines};
use status::count_status;

impl WgpuNativeRenderResourceCachePlan {
    pub fn from_device_plan(
        previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
        device_plan: &WgpuNativeRenderDevicePlan,
    ) -> Self {
        let buffer_entries = buffer_entries(previous_plan, device_plan);
        let pipeline_entries = pipeline_entries(previous_plan, device_plan);
        let bind_group_entries = bind_group_entries(previous_plan, device_plan);
        let released_buffers = released_buffers(previous_plan, &buffer_entries);
        let released_pipelines = released_pipelines(previous_plan, &pipeline_entries);
        let released_bind_groups = released_bind_groups(previous_plan, &bind_group_entries);

        Self {
            revision: device_plan.revision,
            previous_revision: previous_plan.map(|plan| plan.revision),
            buffer_create_count: count_status(
                &buffer_entries,
                WgpuNativeRenderCacheEntryStatus::Create,
            ),
            buffer_reuse_count: count_status(
                &buffer_entries,
                WgpuNativeRenderCacheEntryStatus::Reuse,
            ),
            buffer_recreate_count: count_status(
                &buffer_entries,
                WgpuNativeRenderCacheEntryStatus::Recreate,
            ),
            buffer_release_count: released_buffers.len(),
            buffer_resident_count: buffer_entries.len(),
            buffer_resident_byte_len: buffer_entries.iter().map(|entry| entry.byte_len).sum(),
            pipeline_create_count: count_status(
                &pipeline_entries,
                WgpuNativeRenderCacheEntryStatus::Create,
            ),
            pipeline_reuse_count: count_status(
                &pipeline_entries,
                WgpuNativeRenderCacheEntryStatus::Reuse,
            ),
            pipeline_release_count: released_pipelines.len(),
            pipeline_resident_count: pipeline_entries.len(),
            bind_group_create_count: count_status(
                &bind_group_entries,
                WgpuNativeRenderCacheEntryStatus::Create,
            ),
            bind_group_reuse_count: count_status(
                &bind_group_entries,
                WgpuNativeRenderCacheEntryStatus::Reuse,
            ),
            bind_group_release_count: released_bind_groups.len(),
            bind_group_resident_count: bind_group_entries.len(),
            queue_write_count: device_plan.queue_write_count,
            queue_write_byte_len: device_plan.queue_write_byte_len,
            encoder_count: device_plan.command_encoder_count,
            render_pass_count: device_plan.render_pass_count,
            render_pass_command_count: device_plan.render_pass_command_count,
            draw_indexed_count: device_plan.draw_indexed_count,
            skipped_draw_count: device_plan.skipped_draw_count,
            buffer_entries,
            pipeline_entries,
            bind_group_entries,
            released_buffers,
            released_pipelines,
            released_bind_groups,
        }
    }
}
