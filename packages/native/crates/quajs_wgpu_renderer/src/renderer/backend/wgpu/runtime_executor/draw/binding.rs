use super::invalid_order;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderPipelineKey,
};

use super::super::device::{
    RuntimeBindGroupState, RuntimePipelineState, WgpuNativeRenderRuntimeState,
};
use super::super::passes::require_pass;
use super::super::resources::{resident_bind_group, resident_pipeline};
use super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};

pub(in crate::renderer::backend::wgpu::runtime_executor) fn set_active_pipeline(
    state: &mut WgpuNativeRenderRuntimeState,
    pass_label: &str,
    cache_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_pass(state, pass_label)?;
    let uses_resource_bind_group =
        pipeline_uses_texture_sampler_bind_group(&resident_pipeline(state, cache_label)?.key);
    state.active_pipeline_cache_label = Some(cache_label.to_string());
    if !uses_resource_bind_group {
        state.active_bind_group_cache_label = None;
    }
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn set_active_bind_group(
    state: &mut WgpuNativeRenderRuntimeState,
    pass_label: &str,
    command_id: &str,
    cache_label: &str,
    resource_ids: &[String],
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_pass(state, pass_label)?;
    let pipeline_cache_label = active_pipeline_cache_label(state, pass_label)?;
    let pipeline = resident_pipeline(state, &pipeline_cache_label)?;
    if !pipeline_uses_texture_sampler_bind_group(&pipeline.key) {
        return invalid_order(format!(
            "cannot set resource bind group for draw '{command_id}' in pass '{pass_label}' while active pipeline '{pipeline_cache_label}' uses {:?}",
            pipeline.key.bind_group_layout
        ));
    }
    let bind_group = resident_bind_group(state, cache_label)?;
    validate_bind_group_resources(cache_label, command_id, bind_group, resource_ids)?;
    validate_bind_group_matches_pipeline(cache_label, command_id, bind_group, pipeline)?;
    state.active_bind_group_cache_label = Some(cache_label.to_string());
    Ok(())
}

pub(super) fn active_pipeline_cache_label(
    state: &WgpuNativeRenderRuntimeState,
    pass_label: &str,
) -> Result<String, WgpuNativeRenderRuntimeError> {
    state.active_pipeline_cache_label.clone().ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("pass '{pass_label}' has draw commands without a bound pipeline"),
        )
    })
}

pub(super) fn active_vertex_buffer_label(
    state: &WgpuNativeRenderRuntimeState,
    pass_label: &str,
) -> Result<String, WgpuNativeRenderRuntimeError> {
    state.active_vertex_buffer_label.clone().ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("pass '{pass_label}' has draw commands without a bound vertex buffer"),
        )
    })
}

pub(super) fn active_index_buffer_label(
    state: &WgpuNativeRenderRuntimeState,
    pass_label: &str,
) -> Result<String, WgpuNativeRenderRuntimeError> {
    state.active_index_buffer_label.clone().ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("pass '{pass_label}' has draw commands without a bound index buffer"),
        )
    })
}

fn validate_bind_group_resources(
    cache_label: &str,
    command_id: &str,
    bind_group: &RuntimeBindGroupState,
    resource_ids: &[String],
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if bind_group.resource_ids.as_slice() != resource_ids {
        return invalid_order(format!(
            "bind group '{cache_label}' for draw '{command_id}' was set with resource ids {:?}, but resident bind group was created for {:?}",
            resource_ids, bind_group.resource_ids
        ));
    }
    Ok(())
}

fn validate_bind_group_matches_pipeline(
    cache_label: &str,
    command_id: &str,
    bind_group: &RuntimeBindGroupState,
    pipeline: &RuntimePipelineState,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if bind_group.layout != pipeline.key.bind_group_layout {
        return invalid_order(format!(
            "bind group '{cache_label}' for draw '{command_id}' has layout {:?}, but active pipeline expects {:?}",
            bind_group.layout, pipeline.key.bind_group_layout
        ));
    }
    Ok(())
}

pub(super) fn pipeline_uses_texture_sampler_bind_group(key: &WgpuNativeRenderPipelineKey) -> bool {
    matches!(
        key.bind_group_layout,
        WgpuNativeRenderBindGroupLayout::TextureSampler
            | WgpuNativeRenderBindGroupLayout::TextAtlas
    )
}
