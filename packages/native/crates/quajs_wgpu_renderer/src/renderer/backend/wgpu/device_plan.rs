mod builder;

use crate::render_graph::RenderPlane;
use crate::resources::ResourceId;

use super::physical::WgpuPhysicalRect;
use super::pipeline::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderDevicePlan {
    pub revision: u64,
    pub staging_buffer_byte_len: usize,
    pub gpu_buffer_count: usize,
    pub gpu_buffer_byte_len: usize,
    pub queue_write_count: usize,
    pub queue_write_byte_len: usize,
    pub pipeline_cache_request_count: usize,
    pub bind_group_cache_request_count: usize,
    pub command_encoder_count: usize,
    pub render_pass_count: usize,
    pub render_pass_command_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_draw_count: usize,
    pub staging_buffer: Option<WgpuNativeRenderDeviceStagingBuffer>,
    pub gpu_buffers: Vec<WgpuNativeRenderDeviceBuffer>,
    pub queue_writes: Vec<WgpuNativeRenderDeviceQueueWrite>,
    pub pipeline_cache_requests: Vec<WgpuNativeRenderDevicePipelineCacheRequest>,
    pub bind_group_cache_requests: Vec<WgpuNativeRenderDeviceBindGroupCacheRequest>,
    pub command_encoders: Vec<WgpuNativeRenderCommandEncoderPlan>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderDeviceStagingBuffer {
    pub label: String,
    pub byte_len: usize,
    pub upload_count: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderDeviceBuffer {
    pub label: String,
    pub descriptor: WgpuNativeRenderBufferDescriptor,
    pub byte_len: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderDeviceQueueWrite {
    pub staging_label: String,
    pub target_label: String,
    pub staging_byte_offset: usize,
    pub buffer_byte_offset: usize,
    pub byte_len: usize,
    pub checksum: u64,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderDevicePipelineCacheRequest {
    pub cache_label: String,
    pub key: WgpuNativeRenderPipelineKey,
    pub descriptor: WgpuNativeRenderPipelineDescriptor,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderDeviceBindGroupCacheRequest {
    pub cache_label: String,
    pub command_id: String,
    pub layout: WgpuNativeRenderBindGroupLayout,
    pub resource_ids: Vec<ResourceId>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderCommandEncoderPlan {
    pub label: String,
    pub pass_count: usize,
    pub command_count: usize,
    pub render_passes: Vec<WgpuNativeRenderDeviceRenderPass>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderDeviceRenderPass {
    pub label: String,
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub command_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_draw_count: usize,
    pub commands: Vec<WgpuNativeRenderDeviceCommand>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderDeviceCommand {
    BeginRenderPass {
        label: String,
        viewport: WgpuPhysicalRect,
    },
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
    EndRenderPass {
        label: String,
    },
}

#[cfg(test)]
mod tests;
