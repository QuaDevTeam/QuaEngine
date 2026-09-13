use std::collections::BTreeMap;

use super::super::super::device_plan::WgpuNativeRenderDevicePlan;
use super::super::{
    WgpuNativeRenderCacheEntryStatus, WgpuNativeRenderCachedBindGroup,
    WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
    WgpuNativeRenderResourceCachePlan,
};

pub(super) fn buffer_entries(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    device_plan: &WgpuNativeRenderDevicePlan,
) -> Vec<WgpuNativeRenderCachedBuffer> {
    let previous = previous_plan
        .map(|plan| {
            plan.buffer_entries
                .iter()
                .map(|entry| (entry.label.clone(), entry))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();

    device_plan
        .gpu_buffers
        .iter()
        .map(|buffer| {
            let status = previous.get(&buffer.label).map_or(
                WgpuNativeRenderCacheEntryStatus::Create,
                |previous| {
                    if previous.byte_len == buffer.byte_len
                        && previous.descriptor == buffer.descriptor
                    {
                        WgpuNativeRenderCacheEntryStatus::Reuse
                    } else {
                        WgpuNativeRenderCacheEntryStatus::Recreate
                    }
                },
            );
            WgpuNativeRenderCachedBuffer {
                label: buffer.label.clone(),
                descriptor: buffer.descriptor.clone(),
                byte_len: buffer.byte_len,
                status,
            }
        })
        .collect()
}

pub(super) fn pipeline_entries(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    device_plan: &WgpuNativeRenderDevicePlan,
) -> Vec<WgpuNativeRenderCachedPipeline> {
    let previous = previous_plan
        .map(|plan| {
            plan.pipeline_entries
                .iter()
                .map(|entry| (entry.cache_label.clone(), entry))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();

    device_plan
        .pipeline_cache_requests
        .iter()
        .map(|request| {
            let status = previous.get(&request.cache_label).map_or(
                WgpuNativeRenderCacheEntryStatus::Create,
                |previous| {
                    if previous.key == request.key && previous.descriptor == request.descriptor {
                        WgpuNativeRenderCacheEntryStatus::Reuse
                    } else {
                        WgpuNativeRenderCacheEntryStatus::Recreate
                    }
                },
            );
            WgpuNativeRenderCachedPipeline {
                cache_label: request.cache_label.clone(),
                key: request.key.clone(),
                descriptor: request.descriptor.clone(),
                status,
            }
        })
        .collect()
}

pub(super) fn bind_group_entries(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    device_plan: &WgpuNativeRenderDevicePlan,
) -> Vec<WgpuNativeRenderCachedBindGroup> {
    let previous = previous_plan
        .map(|plan| {
            plan.bind_group_entries
                .iter()
                .map(|entry| (entry.cache_label.clone(), entry))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();

    device_plan
        .bind_group_cache_requests
        .iter()
        .map(|request| {
            let resource_ids = request
                .resource_ids
                .iter()
                .map(|resource_id| resource_id.as_str().to_string())
                .collect::<Vec<_>>();
            let status = previous.get(&request.cache_label).map_or(
                WgpuNativeRenderCacheEntryStatus::Create,
                |previous| {
                    if previous.layout == request.layout && previous.resource_ids == resource_ids {
                        WgpuNativeRenderCacheEntryStatus::Reuse
                    } else {
                        WgpuNativeRenderCacheEntryStatus::Recreate
                    }
                },
            );
            WgpuNativeRenderCachedBindGroup {
                cache_label: request.cache_label.clone(),
                command_id: request.command_id.clone(),
                layout: request.layout,
                resource_ids,
                status,
            }
        })
        .collect()
}
