mod binding;
mod ranges;

pub(super) use binding::{set_active_bind_group, set_active_pipeline};

use super::device::WgpuNativeRenderRuntimeState;
use super::passes::require_pass;
use super::resources::{require_buffer_role_and_byte_len, resident_pipeline};
use super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};
use crate::renderer::backend::wgpu::{WgpuNativeRenderBufferRole, WgpuPhysicalRect};
use binding::{
    active_index_buffer_label, active_pipeline_cache_label, active_vertex_buffer_label,
    pipeline_uses_texture_sampler_bind_group,
};
use ranges::{resident_buffer_byte_len, validate_draw_buffer_ranges};

pub(super) fn validate_draw_state(
    state: &mut WgpuNativeRenderRuntimeState,
    pass_label: &str,
    command_id: &str,
    first_index: u32,
    index_count: u32,
    first_vertex: u32,
    vertex_count: u32,
    physical_bounds: WgpuPhysicalRect,
    scissor: Option<WgpuPhysicalRect>,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_pass(state, pass_label)?;
    if index_count == 0 || vertex_count == 0 || physical_bounds.is_empty() {
        return invalid_order(format!(
            "draw '{command_id}' in pass '{pass_label}' has an empty index/vertex range or bounds"
        ));
    }
    if scissor.map_or(false, WgpuPhysicalRect::is_empty) {
        return invalid_order(format!(
            "draw '{command_id}' in pass '{pass_label}' has an empty scissor rect"
        ));
    }
    let pipeline_cache_label = active_pipeline_cache_label(state, pass_label)?;
    let pipeline = resident_pipeline(state, &pipeline_cache_label)?;
    let vertex_buffer_label = active_vertex_buffer_label(state, pass_label)?;
    let index_buffer_label = active_index_buffer_label(state, pass_label)?;
    validate_draw_buffer_ranges(
        state,
        command_id,
        &vertex_buffer_label,
        &index_buffer_label,
        first_index,
        index_count,
        first_vertex,
        vertex_count,
    )?;
    require_buffer_role_and_byte_len(
        state,
        &vertex_buffer_label,
        WgpuNativeRenderBufferRole::Vertex,
        resident_buffer_byte_len(state, &vertex_buffer_label)?,
    )?;
    require_buffer_role_and_byte_len(
        state,
        &index_buffer_label,
        WgpuNativeRenderBufferRole::Index,
        resident_buffer_byte_len(state, &index_buffer_label)?,
    )?;
    let bind_group_cache_label = if pipeline_uses_texture_sampler_bind_group(&pipeline.key) {
        Some(state.active_bind_group_cache_label.clone().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!(
                    "pass '{pass_label}' has draw '{command_id}' without a bound resource bind group"
                ),
            )
        })?)
    } else {
        None
    };
    record_active_draw_references(
        state,
        command_id,
        &vertex_buffer_label,
        &index_buffer_label,
        &pipeline_cache_label,
        bind_group_cache_label.as_deref(),
    );
    Ok(())
}

fn record_active_draw_references(
    state: &mut WgpuNativeRenderRuntimeState,
    command_id: &str,
    vertex_buffer_label: &str,
    index_buffer_label: &str,
    pipeline_cache_label: &str,
    bind_group_cache_label: Option<&str>,
) {
    for label in [vertex_buffer_label, index_buffer_label] {
        state
            .active_draw_buffer_refs
            .entry(label.to_string())
            .or_insert_with(|| command_id.to_string());
    }
    state
        .active_draw_pipeline_refs
        .entry(pipeline_cache_label.to_string())
        .or_insert_with(|| command_id.to_string());
    if let Some(bind_group_cache_label) = bind_group_cache_label {
        state
            .active_draw_bind_group_refs
            .entry(bind_group_cache_label.to_string())
            .or_insert_with(|| command_id.to_string());
    }
}

fn invalid_order<T>(message: impl Into<String>) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        message.into(),
    ))
}
