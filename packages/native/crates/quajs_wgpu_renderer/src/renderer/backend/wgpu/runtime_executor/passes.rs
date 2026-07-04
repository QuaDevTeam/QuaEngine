use super::device::WgpuNativeRenderRuntimeState;
use super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

pub(super) fn create_encoder(
    state: &mut WgpuNativeRenderRuntimeState,
    label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_encoder.is_some() || state.active_pass.is_some() {
        return invalid_order("cannot create encoder while another encoder or pass is active");
    }
    state.active_encoder = Some(label.to_string());
    Ok(())
}

pub(super) fn begin_pass(
    state: &mut WgpuNativeRenderRuntimeState,
    encoder_label: &str,
    pass_label: &str,
    viewport: WgpuPhysicalRect,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    match state.active_encoder.as_deref() {
        Some(active) if active == encoder_label => {}
        Some(active) => {
            return invalid_order(format!(
                "active encoder '{active}' does not match pass encoder '{encoder_label}'"
            ));
        }
        None => return invalid_order("cannot begin render pass without an active encoder"),
    }
    if state.active_pass.is_some() {
        return invalid_order("cannot begin render pass while another pass is active");
    }
    validate_pass_viewport(pass_label, viewport)?;
    state.active_pass = Some(pass_label.to_string());
    state.active_viewport = Some(viewport);
    state.active_vertex_buffer_label = None;
    state.active_index_buffer_label = None;
    state.active_pipeline_cache_label = None;
    state.active_bind_group_cache_label = None;
    state.active_draw_buffer_refs.clear();
    state.active_draw_pipeline_refs.clear();
    state.active_draw_bind_group_refs.clear();
    Ok(())
}

pub(super) fn set_viewport(
    state: &mut WgpuNativeRenderRuntimeState,
    pass_label: &str,
    viewport: WgpuPhysicalRect,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_pass(state, pass_label)?;
    validate_pass_viewport(pass_label, viewport)?;
    state.active_viewport = Some(viewport);
    Ok(())
}

pub(super) fn require_pass(
    state: &WgpuNativeRenderRuntimeState,
    pass_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    match state.active_pass.as_deref() {
        Some(active) if active == pass_label => Ok(()),
        Some(active) => invalid_order(format!(
            "active render pass '{active}' does not match command pass '{pass_label}'"
        )),
        None => invalid_order("render pass command emitted without an active pass"),
    }
}

pub(super) fn end_pass(
    state: &mut WgpuNativeRenderRuntimeState,
    pass_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_pass(state, pass_label)?;
    state.active_pass = None;
    state.active_viewport = None;
    state.active_vertex_buffer_label = None;
    state.active_index_buffer_label = None;
    state.active_pipeline_cache_label = None;
    state.active_bind_group_cache_label = None;
    state.active_draw_buffer_refs.clear();
    state.active_draw_pipeline_refs.clear();
    state.active_draw_bind_group_refs.clear();
    Ok(())
}

pub(super) fn submit_encoder(
    state: &mut WgpuNativeRenderRuntimeState,
    encoder_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_pass.is_some() {
        return invalid_order("cannot submit command buffer while a render pass is active");
    }
    match state.active_encoder.as_deref() {
        Some(active) if active == encoder_label => {}
        Some(active) => {
            return invalid_order(format!(
                "active encoder '{active}' does not match submitted encoder '{encoder_label}'"
            ));
        }
        None => return invalid_order("cannot submit command buffer without an active encoder"),
    }
    state.active_encoder = None;
    state.submitted_command_buffer_count += 1;
    Ok(())
}

pub(super) fn ensure_no_open_encoder_or_pass(
    state: &WgpuNativeRenderRuntimeState,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.active_pass.is_some() {
        return invalid_order("runtime plan finished with an open render pass");
    }
    if state.active_encoder.is_some() {
        return invalid_order("runtime plan finished with an open command encoder");
    }
    Ok(())
}

fn validate_pass_viewport(
    pass_label: &str,
    viewport: WgpuPhysicalRect,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if viewport.is_empty() {
        return invalid_order(format!("pass '{pass_label}' has an empty viewport"));
    }
    Ok(())
}

fn invalid_order<T>(message: impl Into<String>) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        message.into(),
    ))
}
