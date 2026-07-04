use super::bind_group::pipeline_uses_texture_sampler_bind_group;
use super::pass::{
    missing_draw_state, pipeline_for_draw, required_bind_group_for_draw, validate_draw,
    RealRuntimeDrawIndexed,
};
use super::RealWgpuNativeRenderRuntimeDevice;
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(super) fn prepare_draw_indexed(
        &mut self,
        pass_label: &str,
        command_id: &str,
        first_index: u32,
        index_count: u32,
        first_vertex: u32,
        vertex_count: u32,
        physical_bounds: WgpuPhysicalRect,
        scissor: Option<WgpuPhysicalRect>,
    ) -> Result<RealRuntimeDrawIndexed, WgpuNativeRenderRuntimeError> {
        let (
            pipeline_cache_label,
            bind_group_cache_label,
            vertex_buffer_label,
            index_buffer_label,
            viewport,
        ) = {
            let pass = self.active_pass_mut(pass_label)?;
            let pipeline_cache_label = pass
                .pipeline_cache_label
                .clone()
                .ok_or_else(|| missing_draw_state(pass_label, "pipeline"))?;
            let vertex_buffer_label = pass
                .vertex_buffer_label
                .clone()
                .ok_or_else(|| missing_draw_state(pass_label, "vertex buffer"))?;
            let index_buffer_label = pass
                .index_buffer_label
                .clone()
                .ok_or_else(|| missing_draw_state(pass_label, "index buffer"))?;
            (
                pipeline_cache_label,
                pass.bind_group_cache_label.clone(),
                vertex_buffer_label,
                index_buffer_label,
                pass.viewport,
            )
        };
        let bind_group_cache_label = if pipeline_uses_texture_sampler_bind_group(
            self.require_pipeline(&pipeline_cache_label)?,
        ) {
            bind_group_cache_label
        } else {
            None
        };

        let draw = RealRuntimeDrawIndexed {
            command_id: command_id.to_string(),
            vertex_buffer_label,
            index_buffer_label,
            pipeline_cache_label: pipeline_cache_label.to_string(),
            bind_group_cache_label,
            viewport,
            first_index,
            index_count,
            first_vertex,
            vertex_count,
            physical_bounds,
            scissor,
        };

        {
            let pipeline = pipeline_for_draw(pass_label, &draw, &self.pipelines)?;
            required_bind_group_for_draw(pass_label, &draw, pipeline, &self.bind_groups)?;
            let vertex_buffer = self.require_buffer(&draw.vertex_buffer_label)?;
            let index_buffer = self.require_buffer(&draw.index_buffer_label)?;
            validate_draw(
                pass_label,
                &draw,
                vertex_buffer,
                index_buffer,
                self.target.extent(),
            )?;
        }

        Ok(draw)
    }
}
