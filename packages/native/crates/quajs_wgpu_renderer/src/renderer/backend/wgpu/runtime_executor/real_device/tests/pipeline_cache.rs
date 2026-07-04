use super::*;

#[test]
fn noop_device_rejects_reusing_pipeline_with_mismatched_key() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    let solid_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let mut mismatched_key = solid_key.clone();
    mismatched_key.pipeline = DrawBatchPipeline::Image;

    device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::solid".to_string(),
                key: solid_key.clone(),
                descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
            },
            &mut report,
        )
        .expect("pipeline should be created");

    let error = device
        .apply_runtime_operation(
            &WgpuNativeRenderRuntimeOperation::ReusePipeline {
                cache_label: "pipeline::solid".to_string(),
                key: mismatched_key,
            },
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pipeline::solid"));
    assert!(error.message.contains("key mismatch"));
    assert_eq!(report.pipeline_reuse_count, 0);
    assert_eq!(
        device.pipelines.get("pipeline::solid").unwrap().key,
        solid_key
    );
}
