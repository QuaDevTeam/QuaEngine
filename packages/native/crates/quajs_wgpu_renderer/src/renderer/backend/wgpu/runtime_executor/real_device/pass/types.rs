use crate::renderer::backend::wgpu::WgpuPhysicalRect;

#[derive(Clone, Debug)]
pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) struct RealRuntimePass {
    pub label: String,
    pub viewport: WgpuPhysicalRect,
    pub vertex_buffer_label: Option<String>,
    pub index_buffer_label: Option<String>,
    pub pipeline_cache_label: Option<String>,
    pub bind_group_cache_label: Option<String>,
    pub draws: Vec<RealRuntimeDrawIndexed>,
}

#[derive(Clone, Debug)]
pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) struct RealRuntimeDrawIndexed
{
    pub composite_groups: Vec<crate::render_graph::DrawCompositeGroup>,
    pub command_id: String,
    pub vertex_buffer_label: String,
    pub index_buffer_label: String,
    pub pipeline_cache_label: String,
    pub bind_group_cache_label: Option<String>,
    pub viewport: WgpuPhysicalRect,
    pub first_index: u32,
    pub index_count: u32,
    pub first_vertex: u32,
    pub vertex_count: u32,
    pub physical_bounds: WgpuPhysicalRect,
    pub scissor: Option<WgpuPhysicalRect>,
}
