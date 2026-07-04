use super::super::device::{RuntimePipelineState, WgpuNativeRenderRuntimeState};
use super::super::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use super::guards::{ensure_pipeline_not_referenced_by_active_pass, invalid_order};
use crate::renderer::backend::wgpu::WgpuNativeRenderPipelineKey;

pub(in crate::renderer::backend::wgpu::runtime_executor) fn create_pipeline(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.pipelines.contains_key(cache_label) {
        return invalid_order(format!("pipeline '{cache_label}' already exists"));
    }
    state
        .pipelines
        .insert(cache_label.to_string(), RuntimePipelineState { key });
    report.pipeline_create_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn recreate_pipeline(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_pipeline_not_referenced_by_active_pass(state, cache_label, "recreate")?;
    require_pipeline(state, cache_label)?;
    state
        .pipelines
        .insert(cache_label.to_string(), RuntimePipelineState { key });
    report.pipeline_recreate_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn reuse_pipeline(
    state: &WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
    key: &WgpuNativeRenderPipelineKey,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let pipeline = resident_pipeline(state, cache_label)?;
    if &pipeline.key != key {
        return invalid_order(format!(
            "pipeline '{cache_label}' key mismatch: resident {:?}, requested {:?}",
            pipeline.key, key
        ));
    }
    report.pipeline_reuse_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn release_pipeline(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    cache_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_pipeline_not_referenced_by_active_pass(state, cache_label, "release")?;
    state.pipelines.remove(cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingPipeline,
            format!("cannot release missing pipeline '{cache_label}'"),
        )
    })?;
    report.pipeline_release_count += 1;
    Ok(())
}

fn require_pipeline(
    state: &WgpuNativeRenderRuntimeState,
    cache_label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    resident_pipeline(state, cache_label).map(|_| ())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn resident_pipeline<'a>(
    state: &'a WgpuNativeRenderRuntimeState,
    cache_label: &str,
) -> Result<&'a RuntimePipelineState, WgpuNativeRenderRuntimeError> {
    state.pipelines.get(cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingPipeline,
            format!("pipeline '{cache_label}' is not resident"),
        )
    })
}
