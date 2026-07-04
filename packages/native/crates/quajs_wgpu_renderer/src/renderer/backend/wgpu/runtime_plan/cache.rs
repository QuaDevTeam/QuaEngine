use super::super::resource_cache::{
    WgpuNativeRenderCacheEntryStatus, WgpuNativeRenderCachedBindGroup,
    WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
    WgpuNativeRenderResourceCachePlan,
};
use super::WgpuNativeRenderRuntimeOperation;

pub(super) fn push_releases(
    cache_plan: &WgpuNativeRenderResourceCachePlan,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    operations.extend(cache_plan.released_buffers.iter().map(|buffer| {
        WgpuNativeRenderRuntimeOperation::ReleaseBuffer {
            label: buffer.label.clone(),
            byte_len: buffer.byte_len,
        }
    }));
    operations.extend(cache_plan.released_pipelines.iter().map(|pipeline| {
        WgpuNativeRenderRuntimeOperation::ReleasePipeline {
            cache_label: pipeline.cache_label.clone(),
        }
    }));
    operations.extend(cache_plan.released_bind_groups.iter().map(|bind_group| {
        WgpuNativeRenderRuntimeOperation::ReleaseBindGroup {
            cache_label: bind_group.cache_label.clone(),
        }
    }));
}

pub(super) fn push_cache_operations(
    cache_plan: &WgpuNativeRenderResourceCachePlan,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    operations.extend(cache_plan.buffer_entries.iter().map(buffer_operation));
    operations.extend(cache_plan.pipeline_entries.iter().map(pipeline_operation));
    operations.extend(
        cache_plan
            .bind_group_entries
            .iter()
            .map(bind_group_operation),
    );
}

fn buffer_operation(buffer: &WgpuNativeRenderCachedBuffer) -> WgpuNativeRenderRuntimeOperation {
    match buffer.status {
        WgpuNativeRenderCacheEntryStatus::Create => {
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: buffer.label.clone(),
                descriptor: buffer.descriptor.clone(),
                byte_len: buffer.byte_len,
            }
        }
        WgpuNativeRenderCacheEntryStatus::Reuse => WgpuNativeRenderRuntimeOperation::ReuseBuffer {
            label: buffer.label.clone(),
            byte_len: buffer.byte_len,
        },
        WgpuNativeRenderCacheEntryStatus::Recreate => {
            WgpuNativeRenderRuntimeOperation::RecreateBuffer {
                label: buffer.label.clone(),
                descriptor: buffer.descriptor.clone(),
                byte_len: buffer.byte_len,
            }
        }
    }
}

fn pipeline_operation(
    pipeline: &WgpuNativeRenderCachedPipeline,
) -> WgpuNativeRenderRuntimeOperation {
    match pipeline.status {
        WgpuNativeRenderCacheEntryStatus::Create => {
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: pipeline.cache_label.clone(),
                key: pipeline.key.clone(),
                descriptor: pipeline.descriptor.clone(),
            }
        }
        WgpuNativeRenderCacheEntryStatus::Reuse => {
            WgpuNativeRenderRuntimeOperation::ReusePipeline {
                cache_label: pipeline.cache_label.clone(),
                key: pipeline.key.clone(),
            }
        }
        WgpuNativeRenderCacheEntryStatus::Recreate => {
            WgpuNativeRenderRuntimeOperation::RecreatePipeline {
                cache_label: pipeline.cache_label.clone(),
                key: pipeline.key.clone(),
                descriptor: pipeline.descriptor.clone(),
            }
        }
    }
}

fn bind_group_operation(
    bind_group: &WgpuNativeRenderCachedBindGroup,
) -> WgpuNativeRenderRuntimeOperation {
    match bind_group.status {
        WgpuNativeRenderCacheEntryStatus::Create => {
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: bind_group.cache_label.clone(),
                command_id: bind_group.command_id.clone(),
                layout: bind_group.layout,
                resource_ids: bind_group.resource_ids.clone(),
            }
        }
        WgpuNativeRenderCacheEntryStatus::Reuse => {
            WgpuNativeRenderRuntimeOperation::ReuseBindGroup {
                cache_label: bind_group.cache_label.clone(),
                command_id: bind_group.command_id.clone(),
            }
        }
        WgpuNativeRenderCacheEntryStatus::Recreate => {
            WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
                cache_label: bind_group.cache_label.clone(),
                command_id: bind_group.command_id.clone(),
                layout: bind_group.layout,
                resource_ids: bind_group.resource_ids.clone(),
            }
        }
    }
}
