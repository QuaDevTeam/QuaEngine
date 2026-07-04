use super::super::fixtures::mixed_ui_view;
use super::support::{assert_frame_target_matches_report, create_noop_renderer, landscape_layout};
use super::*;

#[test]
fn real_noop_runtime_executor_renders_generated_mixed_ui_pass_frame_plan() {
    let mut renderer = create_noop_renderer(1600, 900);

    let result = renderer
        .prepare_and_render(landscape_layout(1600.0, 900.0), &mixed_ui_view())
        .unwrap();

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(result.submission.revision, 1);
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreatePipeline { key, .. }
            if key.shader == WgpuNativeRenderShader::SolidColor
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::None
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreatePipeline { key, .. }
            if key.shader == WgpuNativeRenderShader::TexturedQuad
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::TextureSampler
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreatePipeline { key, .. }
            if key.shader == WgpuNativeRenderShader::TextPlaceholder
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::TextAtlas
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::SetBindGroup { command_id, .. }
            if command_id == "ui:mixed:icon"
    )));
    for command_id in [
        "ui:mixed:root",
        "ui:mixed:root:border",
        "ui:mixed:icon",
        "ui:mixed:label",
    ] {
        assert!(runtime_plan.operations.iter().any(|operation| matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id: draw_id, .. }
                if draw_id == command_id
        )));
    }
    assert_eq!(runtime_report.render_pass_count, 1);
    assert_eq!(runtime_report.draw_indexed_count, 4);
    assert_eq!(runtime_report.bind_group_create_count, 2);
    assert_eq!(runtime_report.resident_bind_group_count, 2);
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert_frame_target_matches_report(renderer.backend(), runtime_report, None);
    assert!(renderer.backend().diagnostics().device_attached);
}
