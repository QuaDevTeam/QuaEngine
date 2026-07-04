use super::super::bind_group::create_real_bind_group;
use super::super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use crate::renderer::backend::wgpu::WgpuNativeRenderBindGroupLayout;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(in super::super) fn create_bind_group(
        &mut self,
        cache_label: &str,
        command_id: &str,
        layout: WgpuNativeRenderBindGroupLayout,
        resource_ids: &[String],
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self.bind_groups.contains_key(cache_label) {
            return invalid_order(format!("bind group '{cache_label}' already exists"));
        }
        let bind_group = create_real_bind_group(
            &self.target,
            &self.texture_sampler_bind_group_layout,
            &self.text_atlas_bind_group_layout,
            cache_label,
            command_id,
            layout,
            resource_ids,
            &self.decoded_textures,
        )?;
        self.bind_groups.insert(cache_label.to_string(), bind_group);
        report.bind_group_create_count += 1;
        Ok(())
    }

    pub(in super::super) fn recreate_bind_group(
        &mut self,
        cache_label: &str,
        command_id: &str,
        layout: WgpuNativeRenderBindGroupLayout,
        resource_ids: &[String],
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_bind_group_not_referenced_by_active_pass(cache_label, "recreate")?;
        self.require_bind_group(cache_label)?;
        let bind_group = create_real_bind_group(
            &self.target,
            &self.texture_sampler_bind_group_layout,
            &self.text_atlas_bind_group_layout,
            cache_label,
            command_id,
            layout,
            resource_ids,
            &self.decoded_textures,
        )?;
        self.bind_groups.insert(cache_label.to_string(), bind_group);
        report.bind_group_recreate_count += 1;
        Ok(())
    }

    pub(in super::super) fn release_bind_group(
        &mut self,
        cache_label: &str,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_bind_group_not_referenced_by_active_pass(cache_label, "release")?;
        self.bind_groups.remove(cache_label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
                format!("cannot release missing bind group '{cache_label}'"),
            )
        })?;
        report.bind_group_release_count += 1;
        Ok(())
    }
}
