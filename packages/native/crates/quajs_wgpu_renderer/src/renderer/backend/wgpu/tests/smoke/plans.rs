use super::super::super::*;
use super::super::fixture::view_with_ui_scroll;
use crate::render_graph::{DrawCommandParams, LogicalRect};
use crate::renderer::{
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderFallbackWarningDiagnostics, NativeRenderer,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn submits_frames_through_feature_gated_wgpu_skeleton() {
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::new(
        WgpuNativeRenderBackendConfig {
            adapter_name: Some("test-adapter".to_string()),
            surface_format: Some("Bgra8UnormSrgb".to_string()),
            present_mode: WgpuPresentMode::Fifo,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        },
    ));
    let result = renderer
        .prepare_and_render(
            resolve_stage_layout(
                Some(ViewLayoutInput {
                    preset: Some(ViewLayoutOrientation::Landscape),
                    ..Default::default()
                }),
                StageContainerInput {
                    width: Some(1600.0),
                    height: Some(1000.0),
                    ..Default::default()
                },
            ),
            &view_with_ui_scroll(),
        )
        .unwrap();
    let expected_draw_plan = NativeBackendDrawPlan::from_submission_and_resources(
        &result.submission,
        renderer.resources(),
    );
    let expected_encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&expected_draw_plan);
    let expected_command_stream_plan =
        NativeBackendCommandStreamPlan::from_encoder_plan(&expected_encoder_plan);
    let expected_execution_report =
        NativeBackendExecutionReport::from_command_stream_plan(&expected_command_stream_plan);
    let expected_execution_plan =
        WgpuNativeRenderExecutionPlan::from_command_stream_plan(&expected_command_stream_plan);
    let expected_primitive_plan =
        WgpuNativeRenderPrimitivePlan::from_execution_plan(&expected_execution_plan);
    let expected_mesh_plan =
        WgpuNativeRenderMeshPlan::from_primitive_plan(&expected_primitive_plan);
    let expected_buffer_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&expected_mesh_plan);
    let expected_render_pass_plan =
        WgpuNativeRenderPassPlan::from_buffer_plan(&expected_buffer_plan);
    let expected_pipeline_plan =
        WgpuNativeRenderPipelinePlan::from_render_pass_plan(&expected_render_pass_plan);
    let expected_gpu_frame_plan = WgpuNativeRenderGpuFramePlan::from_buffer_and_pipeline_plans(
        &expected_buffer_plan,
        &expected_pipeline_plan,
    );
    let expected_submission_plan =
        WgpuNativeRenderSubmissionPlan::from_gpu_frame_plan(&expected_gpu_frame_plan);
    let expected_device_plan =
        WgpuNativeRenderDevicePlan::from_submission_plan(&expected_submission_plan);
    let expected_resource_cache_plan =
        WgpuNativeRenderResourceCachePlan::from_device_plan(None, &expected_device_plan);
    let expected_runtime_plan = WgpuNativeRenderRuntimePlan::from_device_and_cache_plans(
        &expected_device_plan,
        &expected_resource_cache_plan,
    );
    let expected_runtime_report = renderer
        .backend()
        .last_runtime_report()
        .cloned()
        .expect("expected runtime execution report");
    let expected_runtime_snapshot = renderer.backend().runtime_snapshot();

    assert_eq!(result.submission.revision, 1);
    assert_eq!(
        renderer.backend().submissions(),
        &[result.submission.clone()]
    );
    assert_eq!(
        renderer.backend().draw_plans(),
        &[expected_draw_plan.clone()]
    );
    assert_eq!(
        renderer.backend().encoder_plans(),
        &[expected_encoder_plan.clone()]
    );
    assert_eq!(
        renderer.backend().command_stream_plans(),
        &[expected_command_stream_plan.clone()]
    );
    assert_eq!(
        renderer.backend().execution_reports(),
        &[expected_execution_report.clone()]
    );
    assert_eq!(
        renderer.backend().execution_plans(),
        &[expected_execution_plan.clone()]
    );
    assert_eq!(
        renderer.backend().primitive_plans(),
        &[expected_primitive_plan.clone()]
    );
    assert_eq!(
        renderer.backend().mesh_plans(),
        &[expected_mesh_plan.clone()]
    );
    assert_eq!(
        renderer.backend().buffer_plans(),
        &[expected_buffer_plan.clone()]
    );
    assert_eq!(
        renderer.backend().render_pass_plans(),
        &[expected_render_pass_plan.clone()]
    );
    assert_eq!(
        renderer.backend().pipeline_plans(),
        &[expected_pipeline_plan.clone()]
    );
    assert_eq!(
        renderer.backend().gpu_frame_plans(),
        &[expected_gpu_frame_plan.clone()]
    );
    assert_eq!(
        renderer.backend().submission_plans(),
        &[expected_submission_plan.clone()]
    );
    assert_eq!(
        renderer.backend().device_plans(),
        &[expected_device_plan.clone()]
    );
    assert_eq!(
        renderer.backend().resource_cache_plans(),
        &[expected_resource_cache_plan.clone()]
    );
    assert_eq!(
        renderer.backend().runtime_plans(),
        &[expected_runtime_plan.clone()]
    );
    assert_eq!(
        renderer.backend().runtime_reports(),
        &[expected_runtime_report.clone()]
    );
    assert_eq!(expected_execution_plan.revision, 1);
    assert_eq!(
        expected_execution_plan.operation_count,
        expected_command_stream_plan.command_count
    );
    assert_eq!(expected_execution_plan.validation.error_count, 0);
    assert!(expected_execution_plan
        .passes
        .iter()
        .flat_map(|pass| pass.operations.iter())
        .any(|operation| matches!(
            operation,
            WgpuNativeRenderExecutionOperation::Draw { .. }
                | WgpuNativeRenderExecutionOperation::SkipDraw { .. }
        )));
    let inside_button_draw = expected_execution_plan
        .passes
        .iter()
        .flat_map(|pass| pass.operations.iter())
        .find_map(|operation| match operation {
            WgpuNativeRenderExecutionOperation::Draw {
                command_id,
                metadata,
                physical_bounds,
                ..
            } if command_id == "ui:menu:inside" => Some((metadata, physical_bounds)),
            _ => None,
        })
        .expect("expected inside button draw operation");
    assert_eq!(
        inside_button_draw.0.bounds,
        LogicalRect {
            x: 24.0,
            y: 44.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(inside_button_draw.0.opacity, 1.0);
    assert!(matches!(
        inside_button_draw.0.params,
        DrawCommandParams::UiButton(_)
    ));
    assert_eq!(
        inside_button_draw.0.owner_package_id.as_deref(),
        Some("runtime.menu")
    );
    assert!(inside_button_draw
        .0
        .required_package_ids
        .contains("runtime.ui"));
    assert_eq!(
        *inside_button_draw.1,
        WgpuPhysicalRect {
            x: 22,
            y: 40,
            width: 204,
            height: 53,
        }
    );
    assert_eq!(
        renderer.backend().config().adapter_name.as_deref(),
        Some("test-adapter")
    );
    assert!(expected_runtime_plan
        .operations
        .iter()
        .any(|operation| matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::QueueWrite { .. }
        )));
    assert!(expected_runtime_plan
        .operations
        .iter()
        .any(|operation| matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
                if command_id == "ui:menu:inside"
        )));
    assert!(matches!(
        expected_runtime_plan.operations.last(),
        Some(WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer { .. })
    ));
    assert_eq!(
        renderer.backend().diagnostics(),
        WgpuNativeRenderBackendDiagnostics {
            feature_enabled: true,
            device_attached: false,
            submitted_frames: 1,
            resources: NativeRenderBackendResourceDiagnostics {
                frames_with_missing_resources: 0,
                missing_resource_count: 0,
                last_missing_resources: Vec::new(),
                ..Default::default()
            },
            fallback_warnings: NativeRenderFallbackWarningDiagnostics::default(),
            last_submission: Some(result.submission),
            last_draw_plan: Some(expected_draw_plan),
            last_encoder_plan: Some(expected_encoder_plan),
            last_command_stream_plan: Some(expected_command_stream_plan),
            last_execution_report: Some(expected_execution_report),
            last_execution_plan: Some(expected_execution_plan),
            last_primitive_plan: Some(expected_primitive_plan),
            last_mesh_plan: Some(expected_mesh_plan),
            last_buffer_plan: Some(expected_buffer_plan),
            last_render_pass_plan: Some(expected_render_pass_plan),
            last_pipeline_plan: Some(expected_pipeline_plan),
            last_gpu_frame_plan: Some(expected_gpu_frame_plan),
            last_submission_plan: Some(expected_submission_plan),
            last_device_plan: Some(expected_device_plan),
            last_resource_cache_plan: Some(expected_resource_cache_plan),
            last_runtime_plan: Some(expected_runtime_plan),
            last_runtime_report: Some(expected_runtime_report),
            runtime_snapshot: expected_runtime_snapshot,
            note: "wgpu-backend feature is enabled and records wgpu execution, primitive, mesh, buffer, render pass, pipeline, GPU frame upload, submission, device execution, resource cache, runtime apply plans, and in-memory runtime execution reports; the real device/surface bridge is not attached yet."
                .to_string(),
        }
    );
}
