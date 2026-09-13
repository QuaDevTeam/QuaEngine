mod builder;

use crate::render_graph::RenderPlane;
use crate::resources::ResourceId;

use super::physical::WgpuPhysicalRect;
use super::pipeline::{
    WgpuNativeRenderBufferDescriptor, WgpuNativeRenderPipelineDescriptor,
    WgpuNativeRenderPipelineKey, WgpuNativeRenderResourceBindGroup,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderSubmissionPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub staging_buffer_byte_len: usize,
    pub gpu_buffer_count: usize,
    pub gpu_buffer_byte_len: usize,
    pub queue_write_count: usize,
    pub queue_write_byte_len: usize,
    pub pipeline_cache_entry_count: usize,
    pub bind_group_cache_entry_count: usize,
    pub render_pass_count: usize,
    pub draw_call_count: usize,
    pub skipped_draw_count: usize,
    pub staging_buffer: WgpuNativeRenderStagingBufferPlan,
    pub gpu_buffers: Vec<WgpuNativeRenderGpuBufferAllocation>,
    pub queue_writes: Vec<WgpuNativeRenderQueueWrite>,
    pub pipeline_cache_entries: Vec<WgpuNativeRenderPipelineCacheEntry>,
    pub bind_group_cache_entries: Vec<WgpuNativeRenderBindGroupCacheEntry>,
    pub render_passes: Vec<WgpuNativeRenderSubmissionPass>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderStagingBufferPlan {
    pub label: String,
    pub byte_len: usize,
    pub upload_count: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderGpuBufferAllocation {
    pub label: String,
    pub descriptor: WgpuNativeRenderBufferDescriptor,
    pub byte_len: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderQueueWrite {
    pub target_label: String,
    pub staging_byte_offset: usize,
    pub buffer_byte_offset: usize,
    pub byte_len: usize,
    pub checksum: u64,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderPipelineCacheEntry {
    pub key: WgpuNativeRenderPipelineKey,
    pub descriptor: WgpuNativeRenderPipelineDescriptor,
    pub cache_label: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderBindGroupCacheEntry {
    pub cache_label: String,
    pub group: WgpuNativeRenderResourceBindGroup,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderSubmissionPass {
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub draw_count: usize,
    pub skipped_draw_count: usize,
    pub commands: Vec<WgpuNativeRenderSubmissionCommand>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderSubmissionCommand {
    SetViewport {
        viewport: WgpuPhysicalRect,
    },
    SetVertexBuffer {
        buffer_label: String,
        byte_len: usize,
    },
    SetIndexBuffer {
        buffer_label: String,
        byte_len: usize,
    },
    SetPipeline {
        command_id: String,
        key: WgpuNativeRenderPipelineKey,
        cache_label: String,
    },
    SetBindGroup {
        command_id: String,
        cache_label: String,
        resource_ids: Vec<ResourceId>,
    },
    DrawIndexed {
        command_id: String,
        first_index: u32,
        index_count: u32,
        first_vertex: u32,
        vertex_count: u32,
        physical_bounds: WgpuPhysicalRect,
        scissor: Option<WgpuPhysicalRect>,
    },
    SkipDraw {
        command_id: String,
        reason: String,
        resource_ids: Vec<ResourceId>,
        owner_package_id: Option<String>,
        required_package_ids: Vec<String>,
    },
}

#[cfg(test)]
mod tests;
