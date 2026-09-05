use std::collections::BTreeMap;

use super::super::{
    WgpuNativeRenderRuntimeSnapshot, WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBufferRole, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderResourceBindGroup, WgpuPhysicalRect,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub(in crate::renderer::backend::wgpu::runtime_executor) struct WgpuNativeRenderRuntimeState {
    pub(in crate::renderer::backend::wgpu::runtime_executor) buffers:
        BTreeMap<String, RuntimeBufferState>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) pipelines:
        BTreeMap<String, RuntimePipelineState>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) bind_groups:
        BTreeMap<String, RuntimeBindGroupState>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_encoder: Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_pass: Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_viewport:
        Option<WgpuPhysicalRect>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_vertex_buffer_label:
        Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_index_buffer_label:
        Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_pipeline_cache_label:
        Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_bind_group_cache_label:
        Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_draw_buffer_refs:
        BTreeMap<String, String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_draw_pipeline_refs:
        BTreeMap<String, String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) active_draw_bind_group_refs:
        BTreeMap<String, String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor) submitted_command_buffer_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(in crate::renderer::backend::wgpu::runtime_executor) struct RuntimeBufferState {
    pub(in crate::renderer::backend::wgpu::runtime_executor) role: WgpuNativeRenderBufferRole,
    pub(in crate::renderer::backend::wgpu::runtime_executor) byte_len: usize,
    pub(in crate::renderer::backend::wgpu::runtime_executor) write_count: usize,
    pub(in crate::renderer::backend::wgpu::runtime_executor) last_checksum: Option<u64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(in crate::renderer::backend::wgpu::runtime_executor) struct RuntimePipelineState {
    pub(in crate::renderer::backend::wgpu::runtime_executor) key: WgpuNativeRenderPipelineKey,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(in crate::renderer::backend::wgpu::runtime_executor) struct RuntimeBindGroupState {
    pub(in crate::renderer::backend::wgpu::runtime_executor) command_id: String,
    pub(in crate::renderer::backend::wgpu::runtime_executor) layout:
        WgpuNativeRenderBindGroupLayout,
    pub(in crate::renderer::backend::wgpu::runtime_executor) resource_ids: Vec<String>,
}

impl WgpuNativeRenderRuntimeState {
    pub(super) fn snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        WgpuNativeRenderRuntimeSnapshot {
            resident_texture_dimensions: BTreeMap::new(),
            resident_compositor_texture_byte_len: 0,
            resident_buffer_count: self.buffers.len(),
            resident_buffer_byte_len: self.buffers.values().map(|buffer| buffer.byte_len).sum(),
            resident_pipeline_count: self.pipelines.len(),
            resident_bind_group_count: self.bind_groups.len(),
            resident_texture_count: 0,
            resident_texture_byte_len: 0,
            resident_texture_resource_ids: Vec::new(),
            resident_texture_byte_len_by_package: BTreeMap::new(),
            texture_sampler_diagnostics: WgpuNativeRenderRuntimeTextureSamplerDiagnostics::default(
            ),
            submitted_command_buffer_count: self.submitted_command_buffer_count,
        }
    }
}

impl From<&WgpuNativeRenderResourceBindGroup> for RuntimeBindGroupState {
    fn from(group: &WgpuNativeRenderResourceBindGroup) -> Self {
        Self {
            command_id: group.command_id.clone(),
            layout: group.layout,
            resource_ids: group
                .resource_ids
                .iter()
                .map(|resource_id| resource_id.as_str().to_string())
                .collect(),
        }
    }
}
