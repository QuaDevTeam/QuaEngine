use super::support::{noop_executor, pipeline_descriptor, pipeline_label};
use super::*;

#[test]
fn noop_device_rejects_text_atlas_pipeline_without_placeholder_shader() {
    let mut executor = noop_executor();
    let key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Text,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let operations = vec![WgpuNativeRenderRuntimeOperation::CreatePipeline {
        cache_label: pipeline_label("unsupported-text-atlas"),
        key: key.clone(),
        descriptor: pipeline_descriptor("unsupported-text-atlas", key),
    }];
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 6,
        operation_count: operations.len(),
        cache_operation_count: 1,
        operations,
        ..Default::default()
    };

    let error = executor.apply_runtime_plan(&plan).unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("unsupported-text-atlas"));
    assert!(error
        .message
        .contains("TextAtlas pipelines are currently supported only"));
}
