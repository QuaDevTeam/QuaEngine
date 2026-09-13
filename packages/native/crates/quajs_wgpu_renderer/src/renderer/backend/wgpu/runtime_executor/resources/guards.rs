use super::super::device::WgpuNativeRenderRuntimeState;
use super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};

pub(super) fn ensure_buffer_not_referenced_by_active_pass(
    state: &WgpuNativeRenderRuntimeState,
    label: &str,
    operation: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_vertex_buffer_label.as_deref() == Some(label)
        || state.active_index_buffer_label.as_deref() == Some(label)
    {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} buffer '{label}' while it is bound in active pass '{pass_label}'"
            ));
        }
    }
    if let Some(command_id) = state.active_draw_buffer_refs.get(label) {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} buffer '{label}' while queued draw '{command_id}' in active pass '{pass_label}' references it"
            ));
        }
    }
    Ok(())
}

pub(super) fn ensure_pipeline_not_referenced_by_active_pass(
    state: &WgpuNativeRenderRuntimeState,
    cache_label: &str,
    operation: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_pipeline_cache_label.as_deref() == Some(cache_label) {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} pipeline '{cache_label}' while it is bound in active pass '{pass_label}'"
            ));
        }
    }
    if let Some(command_id) = state.active_draw_pipeline_refs.get(cache_label) {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} pipeline '{cache_label}' while queued draw '{command_id}' in active pass '{pass_label}' references it"
            ));
        }
    }
    Ok(())
}

pub(super) fn ensure_bind_group_not_referenced_by_active_pass(
    state: &WgpuNativeRenderRuntimeState,
    cache_label: &str,
    operation: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_bind_group_cache_label.as_deref() == Some(cache_label) {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} bind group '{cache_label}' while it is bound in active pass '{pass_label}'"
            ));
        }
    }
    if let Some(command_id) = state.active_draw_bind_group_refs.get(cache_label) {
        if let Some(pass_label) = state.active_pass.as_deref() {
            return invalid_order(format!(
                "cannot {operation} bind group '{cache_label}' while queued draw '{command_id}' in active pass '{pass_label}' references it"
            ));
        }
    }
    Ok(())
}

pub(super) fn invalid_order<T>(message: String) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        message,
    ))
}
