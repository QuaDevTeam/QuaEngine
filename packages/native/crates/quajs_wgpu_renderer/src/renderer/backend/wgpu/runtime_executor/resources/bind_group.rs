use super::super::device::{RuntimeBindGroupState, WgpuNativeRenderRuntimeState};
use super::super::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use super::guards::{ensure_bind_group_not_referenced_by_active_pass, invalid_order};
use crate::renderer::backend::wgpu::WgpuNativeRenderBindGroupLayout;

pub(in crate::renderer::backend::wgpu::runtime_executor) fn create_bind_group(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
    command_id: &str,
    layout: WgpuNativeRenderBindGroupLayout,
    resource_ids: &[String],
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.bind_groups.contains_key(cache_label) {
        return invalid_order(format!("bind group '{cache_label}' already exists"));
    }
    state.bind_groups.insert(
        cache_label.to_string(),
        RuntimeBindGroupState {
            command_id: command_id.to_string(),
            layout,
            resource_ids: resource_ids.to_vec(),
        },
    );
    report.bind_group_create_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn recreate_bind_group(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
    command_id: &str,
    layout: WgpuNativeRenderBindGroupLayout,
    resource_ids: &[String],
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_bind_group_not_referenced_by_active_pass(state, cache_label, "recreate")?;
    require_bind_group(state, cache_label)?;
    state.bind_groups.insert(
        cache_label.to_string(),
        RuntimeBindGroupState {
            command_id: command_id.to_string(),
            layout,
            resource_ids: resource_ids.to_vec(),
        },
    );
    report.bind_group_recreate_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn release_bind_group(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_bind_group_not_referenced_by_active_pass(state, cache_label, "release")?;
    state.bind_groups.remove(cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
            format!("cannot release missing bind group '{cache_label}'"),
        )
    })?;
    report.bind_group_release_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn require_bind_group(
    state: &WgpuNativeRenderRuntimeState,
    cache_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    resident_bind_group(state, cache_label).map(|_| ())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn resident_bind_group<'a>(
    state: &'a WgpuNativeRenderRuntimeState,
    cache_label: &str,
) -> Result<&'a RuntimeBindGroupState, WgpuNativeRenderRuntimeError> {
    state.bind_groups.get(cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
            format!("bind group '{cache_label}' is not resident"),
        )
    })
}
