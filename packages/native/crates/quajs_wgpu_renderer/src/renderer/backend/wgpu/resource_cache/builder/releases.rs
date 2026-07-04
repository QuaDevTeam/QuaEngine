use std::collections::BTreeSet;

use super::super::{
    WgpuNativeRenderCachedBindGroup, WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
    WgpuNativeRenderReleasedBindGroup, WgpuNativeRenderReleasedBuffer,
    WgpuNativeRenderReleasedPipeline, WgpuNativeRenderResourceCachePlan,
};

pub(super) fn released_buffers(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    current_entries: &[WgpuNativeRenderCachedBuffer],
) -> Vec<WgpuNativeRenderReleasedBuffer> {
    let current = current_entries
        .iter()
        .map(|entry| entry.label.as_str())
        .collect::<BTreeSet<_>>();
    previous_plan
        .into_iter()
        .flat_map(|plan| plan.buffer_entries.iter())
        .filter(|entry| !current.contains(entry.label.as_str()))
        .map(|entry| WgpuNativeRenderReleasedBuffer {
            label: entry.label.clone(),
            byte_len: entry.byte_len,
        })
        .collect()
}

pub(super) fn released_pipelines(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    current_entries: &[WgpuNativeRenderCachedPipeline],
) -> Vec<WgpuNativeRenderReleasedPipeline> {
    let current = current_entries
        .iter()
        .map(|entry| entry.cache_label.as_str())
        .collect::<BTreeSet<_>>();
    previous_plan
        .into_iter()
        .flat_map(|plan| plan.pipeline_entries.iter())
        .filter(|entry| !current.contains(entry.cache_label.as_str()))
        .map(|entry| WgpuNativeRenderReleasedPipeline {
            cache_label: entry.cache_label.clone(),
        })
        .collect()
}

pub(super) fn released_bind_groups(
    previous_plan: Option<&WgpuNativeRenderResourceCachePlan>,
    current_entries: &[WgpuNativeRenderCachedBindGroup],
) -> Vec<WgpuNativeRenderReleasedBindGroup> {
    let current = current_entries
        .iter()
        .map(|entry| entry.cache_label.as_str())
        .collect::<BTreeSet<_>>();
    previous_plan
        .into_iter()
        .flat_map(|plan| plan.bind_group_entries.iter())
        .filter(|entry| !current.contains(entry.cache_label.as_str()))
        .map(|entry| WgpuNativeRenderReleasedBindGroup {
            cache_label: entry.cache_label.clone(),
        })
        .collect()
}
