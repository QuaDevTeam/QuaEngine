use super::super::super::fixture::view_with_clipped_ui_scroll;
use super::super::fixtures::{contains_f32_sequence, solid_ui_view};
use super::support::{assert_frame_target_matches_report, create_noop_renderer, landscape_layout};
use super::*;

#[test]
fn real_noop_runtime_executor_renders_generated_solid_ui_frame_plan() {
    let mut renderer = create_noop_renderer(1600, 900);

    let result = renderer
        .prepare_and_render(landscape_layout(1600.0, 900.0), &solid_ui_view())
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
    assert!(runtime_plan.draw_indexed_count > 0);
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:menu:panel"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::QueueWrite { bytes, .. }
            if contains_f32_sequence(
                bytes,
                &[0x33 as f32 / 255.0, 0x55 as f32 / 255.0, 0x77 as f32 / 255.0, 1.0],
            )
    )));
    assert_eq!(
        runtime_report.draw_indexed_count,
        runtime_plan.draw_indexed_count
    );
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert_frame_target_matches_report(renderer.backend(), runtime_report, Some((1600, 900)));
    assert!(renderer.backend().diagnostics().device_attached);
}

#[test]
fn real_noop_runtime_executor_applies_generated_scroll_scissor_frame_plan() {
    let mut renderer = create_noop_renderer(1600, 1000);

    renderer
        .prepare_and_render(
            landscape_layout(1600.0, 1000.0),
            &view_with_clipped_ui_scroll(),
        )
        .unwrap();

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");
    let (physical_bounds, scissor) = runtime_plan
        .operations
        .iter()
        .find_map(|operation| match operation {
            WgpuNativeRenderRuntimeOperation::DrawIndexed {
                command_id,
                physical_bounds,
                scissor,
                ..
            } if command_id == "ui:menu:outside" => Some((*physical_bounds, *scissor)),
            _ => None,
        })
        .expect("expected clipped scroll child draw");
    let scissor = scissor.expect("expected scroll child draw to carry scissor");

    assert!(scissor.height < physical_bounds.height);
    assert_eq!(
        runtime_report.draw_indexed_count,
        runtime_plan.draw_indexed_count
    );
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert!(renderer.backend().diagnostics().device_attached);
}
