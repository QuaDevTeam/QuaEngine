use super::super::device_plan::WgpuNativeRenderDevicePlan;
use super::super::resource_cache::WgpuNativeRenderResourceCachePlan;
use super::cache::{push_cache_operations, push_releases};
use super::commands::{push_command_encoders, push_queue_writes};
use super::counts::{cache_operation_count, release_operation_count};
use super::{WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan};

impl WgpuNativeRenderRuntimePlan {
    pub fn from_device_and_cache_plans(
        device_plan: &WgpuNativeRenderDevicePlan,
        cache_plan: &WgpuNativeRenderResourceCachePlan,
    ) -> Self {
        let mut operations = Vec::<WgpuNativeRenderRuntimeOperation>::new();
        push_releases(cache_plan, &mut operations);
        push_cache_operations(cache_plan, &mut operations);
        push_queue_writes(device_plan, &mut operations);
        push_command_encoders(device_plan, &mut operations);
        let operation_count = operations.len();

        Self {
            revision: device_plan.revision,
            previous_revision: cache_plan.previous_revision,
            operation_count,
            cache_operation_count: cache_operation_count(&operations),
            release_operation_count: release_operation_count(&operations),
            queue_write_count: device_plan.queue_write_count,
            queue_write_byte_len: device_plan.queue_write_byte_len,
            encoder_count: device_plan.command_encoder_count,
            render_pass_count: device_plan.render_pass_count,
            render_pass_command_count: device_plan.render_pass_command_count,
            draw_indexed_count: device_plan.draw_indexed_count,
            skipped_draw_count: device_plan.skipped_draw_count,
            submit_count: device_plan.command_encoder_count,
            operations,
        }
    }
}
