use super::super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(super) fn ensure_buffer_not_referenced_by_active_pass(
        &self,
        label: &str,
        operation: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let Some(pass) = self.active_pass_ref() else {
            return Ok(());
        };
        if pass.vertex_buffer_label.as_deref() == Some(label)
            || pass.index_buffer_label.as_deref() == Some(label)
        {
            return invalid_order(format!(
                "cannot {operation} buffer '{label}' while it is bound in active pass '{}'",
                pass.label
            ));
        }
        if let Some(draw) = pass
            .draws
            .iter()
            .find(|draw| draw.vertex_buffer_label == label || draw.index_buffer_label == label)
        {
            return invalid_order(format!(
                "cannot {operation} buffer '{label}' while queued draw '{}' in active pass '{}' references it",
                draw.command_id, pass.label
            ));
        }
        Ok(())
    }

    pub(super) fn ensure_pipeline_not_referenced_by_active_pass(
        &self,
        cache_label: &str,
        operation: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let Some(pass) = self.active_pass_ref() else {
            return Ok(());
        };
        if pass.pipeline_cache_label.as_deref() == Some(cache_label) {
            return invalid_order(format!(
                "cannot {operation} pipeline '{cache_label}' while it is bound in active pass '{}'",
                pass.label
            ));
        }
        if let Some(draw) = pass
            .draws
            .iter()
            .find(|draw| draw.pipeline_cache_label == cache_label)
        {
            return invalid_order(format!(
                "cannot {operation} pipeline '{cache_label}' while queued draw '{}' in active pass '{}' references it",
                draw.command_id, pass.label
            ));
        }
        Ok(())
    }

    pub(super) fn ensure_bind_group_not_referenced_by_active_pass(
        &self,
        cache_label: &str,
        operation: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let Some(pass) = self.active_pass_ref() else {
            return Ok(());
        };
        if pass.bind_group_cache_label.as_deref() == Some(cache_label) {
            return invalid_order(format!(
                "cannot {operation} bind group '{cache_label}' while it is bound in active pass '{}'",
                pass.label
            ));
        }
        if let Some(draw) = pass
            .draws
            .iter()
            .find(|draw| draw.bind_group_cache_label.as_deref() == Some(cache_label))
        {
            return invalid_order(format!(
                "cannot {operation} bind group '{cache_label}' while queued draw '{}' in active pass '{}' references it",
                draw.command_id, pass.label
            ));
        }
        Ok(())
    }
}
