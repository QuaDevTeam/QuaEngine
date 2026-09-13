use super::super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};
use super::super::bind_group::{pipeline_uses_texture_sampler_bind_group, RealRuntimeBindGroup};
use super::super::pass::missing_draw_state;
use super::super::pipeline::RealRuntimePipeline;
use super::super::{invalid_order, RealRuntimeBuffer, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::WgpuNativeRenderBufferRole;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(in super::super) fn require_buffer(
        &self,
        label: &str,
    ) -> Result<&RealRuntimeBuffer, WgpuNativeRenderRuntimeError> {
        self.buffers.get(label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
                format!("missing buffer '{label}'"),
            )
        })
    }

    pub(in super::super) fn require_buffer_role_and_byte_len(
        &self,
        label: &str,
        expected_role: WgpuNativeRenderBufferRole,
        byte_len: usize,
    ) -> Result<&RealRuntimeBuffer, WgpuNativeRenderRuntimeError> {
        let buffer = self.require_buffer(label)?;
        if buffer.role != expected_role {
            return invalid_order(format!(
                "buffer '{label}' role mismatch: resident {:?}, expected {:?}",
                buffer.role, expected_role
            ));
        }
        if buffer.byte_len != byte_len {
            return invalid_order(format!(
                "buffer '{label}' byte length mismatch: resident {}, requested {byte_len}",
                buffer.byte_len
            ));
        }
        Ok(buffer)
    }

    pub(in super::super) fn require_pipeline(
        &self,
        cache_label: &str,
    ) -> Result<&RealRuntimePipeline, WgpuNativeRenderRuntimeError> {
        self.pipelines.get(cache_label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingPipeline,
                format!("missing pipeline '{cache_label}'"),
            )
        })
    }

    pub(in super::super) fn require_bind_group(
        &self,
        cache_label: &str,
    ) -> Result<&RealRuntimeBindGroup, WgpuNativeRenderRuntimeError> {
        self.bind_groups.get(cache_label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
                format!("missing bind group '{cache_label}'"),
            )
        })
    }

    pub(in super::super) fn require_active_texture_sampler_pipeline(
        &self,
        pass_label: &str,
        command_id: &str,
    ) -> Result<&RealRuntimePipeline, WgpuNativeRenderRuntimeError> {
        let pass = self.active_pass_ref().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "render pass command emitted without an active pass",
            )
        })?;
        if pass.label != pass_label {
            return invalid_order(format!(
                "active render pass '{}' does not match command pass '{pass_label}'",
                pass.label
            ));
        }
        let pipeline_cache_label = pass
            .pipeline_cache_label
            .as_deref()
            .ok_or_else(|| missing_draw_state(pass_label, "pipeline"))?;
        let pipeline = self.require_pipeline(pipeline_cache_label)?;
        if !pipeline_uses_texture_sampler_bind_group(pipeline) {
            return invalid_order(format!(
                "cannot set resource bind group for draw '{command_id}' in pass '{pass_label}' while active pipeline '{pipeline_cache_label}' uses {:?}",
                pipeline.key.bind_group_layout
            ));
        }
        Ok(pipeline)
    }

    pub(in super::super) fn require_matching_bind_group(
        &self,
        cache_label: &str,
        command_id: &str,
        resource_ids: &[String],
    ) -> Result<&RealRuntimeBindGroup, WgpuNativeRenderRuntimeError> {
        let bind_group = self.require_bind_group(cache_label)?;
        if bind_group.resource_ids.as_slice() != resource_ids {
            return invalid_order(format!(
                "bind group '{cache_label}' for draw '{command_id}' was set with resource ids {:?}, but resident bind group was created for {:?}",
                resource_ids, bind_group.resource_ids
            ));
        }
        Ok(bind_group)
    }

    pub(in super::super) fn require_buffer_mut(
        &mut self,
        label: &str,
    ) -> Result<&mut RealRuntimeBuffer, WgpuNativeRenderRuntimeError> {
        self.buffers.get_mut(label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
                format!("missing buffer '{label}'"),
            )
        })
    }
}
