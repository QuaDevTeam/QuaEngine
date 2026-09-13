use super::*;

pub(super) fn noop_device() -> RealWgpuNativeRenderRuntimeDevice {
    RealWgpuNativeRenderRuntimeDevice::new(RealWgpuNativeRenderRuntimeTarget::noop(64, 64))
}

pub(super) fn solid_ui_pipeline_key() -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

pub(super) fn apply_setup_operations(
    device: &mut RealWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    operations: impl IntoIterator<Item = WgpuNativeRenderRuntimeOperation>,
) {
    for operation in operations {
        device
            .apply_runtime_operation(&operation, report)
            .expect("setup operation should apply");
    }
}

pub(super) fn assert_active_pass_labels(
    device: &RealWgpuNativeRenderRuntimeDevice,
    expected_vertex: Option<&str>,
    expected_index: Option<&str>,
    expected_pipeline: Option<&str>,
    context: &str,
) {
    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .unwrap_or_else(|| panic!("{context}"));
    assert_eq!(pass.vertex_buffer_label.as_deref(), expected_vertex);
    assert_eq!(pass.index_buffer_label.as_deref(), expected_index);
    assert_eq!(pass.pipeline_cache_label.as_deref(), expected_pipeline);
}

pub(super) fn assert_active_pass_has_no_draws(
    device: &RealWgpuNativeRenderRuntimeDevice,
    context: &str,
) {
    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .unwrap_or_else(|| panic!("{context}"));
    assert!(pass.draws.is_empty());
}
