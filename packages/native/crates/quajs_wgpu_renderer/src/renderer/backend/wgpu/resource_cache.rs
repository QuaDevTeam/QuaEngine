mod builder;

use super::pipeline::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderResourceCachePlan {
    pub revision: u64,
    pub previous_revision: Option<u64>,
    pub buffer_create_count: usize,
    pub buffer_reuse_count: usize,
    pub buffer_recreate_count: usize,
    pub buffer_release_count: usize,
    pub buffer_resident_count: usize,
    pub buffer_resident_byte_len: usize,
    pub pipeline_create_count: usize,
    pub pipeline_reuse_count: usize,
    pub pipeline_recreate_count: usize,
    pub pipeline_release_count: usize,
    pub pipeline_resident_count: usize,
    pub bind_group_create_count: usize,
    pub bind_group_reuse_count: usize,
    pub bind_group_recreate_count: usize,
    pub bind_group_release_count: usize,
    pub bind_group_resident_count: usize,
    pub queue_write_count: usize,
    pub queue_write_byte_len: usize,
    pub encoder_count: usize,
    pub render_pass_count: usize,
    pub render_pass_command_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_draw_count: usize,
    pub buffer_entries: Vec<WgpuNativeRenderCachedBuffer>,
    pub pipeline_entries: Vec<WgpuNativeRenderCachedPipeline>,
    pub bind_group_entries: Vec<WgpuNativeRenderCachedBindGroup>,
    pub released_buffers: Vec<WgpuNativeRenderReleasedBuffer>,
    pub released_pipelines: Vec<WgpuNativeRenderReleasedPipeline>,
    pub released_bind_groups: Vec<WgpuNativeRenderReleasedBindGroup>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderCachedBuffer {
    pub label: String,
    pub descriptor: WgpuNativeRenderBufferDescriptor,
    pub byte_len: usize,
    pub status: WgpuNativeRenderCacheEntryStatus,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderCachedPipeline {
    pub cache_label: String,
    pub key: WgpuNativeRenderPipelineKey,
    pub descriptor: WgpuNativeRenderPipelineDescriptor,
    pub status: WgpuNativeRenderCacheEntryStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderCachedBindGroup {
    pub cache_label: String,
    pub command_id: String,
    pub layout: WgpuNativeRenderBindGroupLayout,
    pub resource_ids: Vec<String>,
    pub status: WgpuNativeRenderCacheEntryStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderReleasedBuffer {
    pub label: String,
    pub byte_len: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderReleasedPipeline {
    pub cache_label: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderReleasedBindGroup {
    pub cache_label: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderCacheEntryStatus {
    Create,
    Reuse,
    Recreate,
}

#[cfg(test)]
mod tests;
