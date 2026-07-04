mod builder;
mod bytes;

use crate::resources::ResourceId;

use super::physical::WgpuPhysicalRect;
use super::pipeline::{
    WgpuNativeRenderBufferDescriptor, WgpuNativeRenderPipelineDescriptor,
    WgpuNativeRenderPipelineKey, WgpuNativeRenderResourceBindGroup,
};

pub use builder::WgpuNativeRenderGpuFramePass;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderGpuFramePlan {
    pub revision: u64,
    pub pass_count: usize,
    pub upload_count: usize,
    pub upload_byte_len: usize,
    pub vertex_upload_byte_len: usize,
    pub index_upload_byte_len: usize,
    pub pipeline_descriptor_count: usize,
    pub resource_bind_group_count: usize,
    pub draw_batch_count: usize,
    pub skipped_draw_count: usize,
    pub pipeline_descriptors: Vec<WgpuNativeRenderPipelineDescriptor>,
    pub passes: Vec<WgpuNativeRenderGpuFramePass>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderGpuBufferUpload {
    pub pass_index: usize,
    pub descriptor: WgpuNativeRenderBufferDescriptor,
    pub staging_byte_offset: usize,
    pub buffer_byte_offset: usize,
    pub byte_len: usize,
    pub element_count: usize,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderGpuDrawBatch {
    pub command_id: String,
    pub key: WgpuNativeRenderPipelineKey,
    pub bind_group: Option<WgpuNativeRenderResourceBindGroup>,
    pub first_index: u32,
    pub index_count: u32,
    pub first_vertex: u32,
    pub vertex_count: u32,
    pub physical_bounds: WgpuPhysicalRect,
    pub scissor: Option<WgpuPhysicalRect>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderGpuSkippedDraw {
    pub command_id: String,
    pub reason: String,
    pub resource_ids: Vec<ResourceId>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
}

#[cfg(test)]
mod tests;
