use super::super::test_fixture::{bind_group, buffer, device_plan, pipeline};
use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole,
    WgpuNativeRenderBufferUsage, WgpuNativeRenderPipelineDescriptor,
    WgpuNativeRenderResourceCachePlan, WgpuNativeRenderRuntimeOperation,
    WgpuNativeRenderRuntimePlan, WgpuPhysicalRect,
};

mod bind_draw;
mod buffers;
mod common;
mod draw_ranges;
mod failure;
mod lifecycle;
mod pass_validation;
