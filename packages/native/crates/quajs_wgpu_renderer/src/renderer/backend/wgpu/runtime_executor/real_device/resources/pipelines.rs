use super::super::pipeline::create_real_pipeline;
use super::super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use crate::renderer::backend::wgpu::WgpuNativeRenderPipelineKey;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(in super::super) fn create_pipeline(
        &mut self,
        cache_label: &str,
        key: WgpuNativeRenderPipelineKey,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self.pipelines.contains_key(cache_label) {
            return invalid_order(format!("pipeline '{cache_label}' already exists"));
        }
        let pipeline = create_real_pipeline(
            &self.target,
            &self.uniforms.layout,
            &self.texture_sampler_bind_group_layout,
            &self.text_atlas_bind_group_layout,
            cache_label,
            key,
        )?;
        self.pipelines.insert(cache_label.to_string(), pipeline);
        report.pipeline_create_count += 1;
        Ok(())
    }

    pub(in super::super) fn reuse_pipeline(
        &self,
        cache_label: &str,
        key: &WgpuNativeRenderPipelineKey,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let pipeline = self.require_pipeline(cache_label)?;
        if &pipeline.key != key {
            return invalid_order(format!(
                "pipeline '{cache_label}' key mismatch: resident {:?}, requested {:?}",
                pipeline.key, key
            ));
        }
        report.pipeline_reuse_count += 1;
        Ok(())
    }

    pub(in super::super) fn recreate_pipeline(
        &mut self,
        cache_label: &str,
        key: WgpuNativeRenderPipelineKey,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_pipeline_not_referenced_by_active_pass(cache_label, "recreate")?;
        self.require_pipeline(cache_label)?;
        let pipeline = create_real_pipeline(
            &self.target,
            &self.uniforms.layout,
            &self.texture_sampler_bind_group_layout,
            &self.text_atlas_bind_group_layout,
            cache_label,
            key,
        )?;
        self.pipelines.insert(cache_label.to_string(), pipeline);
        report.pipeline_recreate_count += 1;
        Ok(())
    }

    pub(in super::super) fn release_pipeline(
        &mut self,
        cache_label: &str,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_pipeline_not_referenced_by_active_pass(cache_label, "release")?;
        self.pipelines.remove(cache_label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingPipeline,
                format!("cannot release missing pipeline '{cache_label}'"),
            )
        })?;
        report.pipeline_release_count += 1;
        Ok(())
    }
}
