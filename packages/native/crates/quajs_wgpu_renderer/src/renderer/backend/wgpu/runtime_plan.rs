mod builder;
mod cache;
mod commands;
mod counts;

use crate::render_graph::RenderPlane;

use super::physical::WgpuPhysicalRect;
use super::pipeline::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderRuntimePlan {
    pub revision: u64,
    pub previous_revision: Option<u64>,
    pub operation_count: usize,
    pub cache_operation_count: usize,
    pub release_operation_count: usize,
    pub queue_write_count: usize,
    pub queue_write_byte_len: usize,
    pub encoder_count: usize,
    pub render_pass_count: usize,
    pub render_pass_command_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_draw_count: usize,
    pub submit_count: usize,
    pub operations: Vec<WgpuNativeRenderRuntimeOperation>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderRuntimeOperation {
    CreateBuffer {
        label: String,
        descriptor: WgpuNativeRenderBufferDescriptor,
        byte_len: usize,
    },
    ReuseBuffer {
        label: String,
        byte_len: usize,
    },
    RecreateBuffer {
        label: String,
        descriptor: WgpuNativeRenderBufferDescriptor,
        byte_len: usize,
    },
    ReleaseBuffer {
        label: String,
        byte_len: usize,
    },
    CreatePipeline {
        cache_label: String,
        key: WgpuNativeRenderPipelineKey,
        descriptor: WgpuNativeRenderPipelineDescriptor,
    },
    ReusePipeline {
        cache_label: String,
        key: WgpuNativeRenderPipelineKey,
    },
    RecreatePipeline {
        cache_label: String,
        key: WgpuNativeRenderPipelineKey,
        descriptor: WgpuNativeRenderPipelineDescriptor,
    },
    ReleasePipeline {
        cache_label: String,
    },
    CreateBindGroup {
        cache_label: String,
        command_id: String,
        layout: WgpuNativeRenderBindGroupLayout,
        resource_ids: Vec<String>,
    },
    ReuseBindGroup {
        cache_label: String,
        command_id: String,
    },
    RecreateBindGroup {
        cache_label: String,
        command_id: String,
        layout: WgpuNativeRenderBindGroupLayout,
        resource_ids: Vec<String>,
    },
    ReleaseBindGroup {
        cache_label: String,
    },
    QueueWrite {
        staging_label: String,
        target_label: String,
        staging_byte_offset: usize,
        buffer_byte_offset: usize,
        byte_len: usize,
        checksum: u64,
        bytes: Vec<u8>,
    },
    CreateCommandEncoder {
        label: String,
        pass_count: usize,
        command_count: usize,
    },
    BeginRenderPass {
        encoder_label: String,
        pass_label: String,
        pass_index: usize,
        plane: Option<RenderPlane>,
        viewport: WgpuPhysicalRect,
        command_count: usize,
    },
    SetViewport {
        pass_label: String,
        viewport: WgpuPhysicalRect,
    },
    SetVertexBuffer {
        pass_label: String,
        buffer_label: String,
        byte_len: usize,
    },
    SetIndexBuffer {
        pass_label: String,
        buffer_label: String,
        byte_len: usize,
    },
    SetPipeline {
        pass_label: String,
        command_id: String,
        key: WgpuNativeRenderPipelineKey,
        cache_label: String,
    },
    SetBindGroup {
        pass_label: String,
        command_id: String,
        cache_label: String,
        resource_ids: Vec<String>,
    },
    DrawIndexed {
        pass_label: String,
        command_id: String,
        first_index: u32,
        index_count: u32,
        first_vertex: u32,
        vertex_count: u32,
        physical_bounds: WgpuPhysicalRect,
        scissor: Option<WgpuPhysicalRect>,
    },
    SkipDraw {
        pass_label: String,
        command_id: String,
        reason: String,
        resource_ids: Vec<String>,
        owner_package_id: Option<String>,
        required_package_ids: Vec<String>,
    },
    EndRenderPass {
        pass_label: String,
    },
    SubmitCommandBuffer {
        encoder_label: String,
        pass_count: usize,
        command_count: usize,
    },
}

#[cfg(test)]
mod tests;
