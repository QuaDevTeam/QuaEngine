use super::support::{assert_frame_target_matches_report, create_noop_renderer};
use super::*;

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

#[test]
fn real_noop_runtime_executor_renders_shared_compiled_qui_qss_fixture() {
    let mut renderer = create_noop_renderer(3200, 2000);

    let result = renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should execute through real-noop wgpu");

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:menu:background-image"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:poster"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:open-settings"
    )));
    assert_eq!(
        runtime_report.draw_indexed_count,
        runtime_plan.draw_indexed_count
    );
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .placeholder_resource_ids_by_bind_group
            .values()
            .filter(|resource_ids| {
                resource_ids.contains(&"images:ui/panel.png".to_string())
                    || resource_ids.contains(&"images:ui/poster.png".to_string())
            })
            .count(),
        2
    );
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
            ..
        }
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::SetBindGroup { command_id, .. }
            if command_id == "ui:compiled-menu:title"
    )));
    assert_frame_target_matches_report(renderer.backend(), runtime_report, Some((3200, 2000)));
    assert!(renderer.backend().diagnostics().device_attached);
}
