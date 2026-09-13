use super::super::super::*;
use super::super::fixture::view_with_clipped_ui_scroll;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendErrorKind, NativeRenderBackendResourceDiagnostics,
    NativeRenderBackendResourcePolicy, NativeRenderFrameRef, NativeRenderer,
};
use crate::resources::NativeResourceLedger;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn rejects_missing_resources_before_wgpu_plan_materialization() {
    let mut backend = WgpuNativeRenderBackend::new(WgpuNativeRenderBackendConfig {
        adapter_name: Some("test-adapter".to_string()),
        surface_format: Some("Bgra8UnormSrgb".to_string()),
        present_mode: WgpuPresentMode::Fifo,
        resource_policy: NativeRenderBackendResourcePolicy::RejectMissingResources,
    });
    let frame = prepare_native_frame(
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
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let error = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 9,
            frame: &frame,
            resources: &resources,
        })
        .expect_err("WGPU backend should reject missing resources when configured to do so");

    assert_eq!(error.kind, NativeRenderBackendErrorKind::BackendRejected);
    assert!(error.message.contains("submission 9"));
    assert!(error.message.contains("images:bg/school.png"));
    assert!(backend.submissions().is_empty());
    assert!(backend.draw_plans().is_empty());
    assert!(backend.execution_plans().is_empty());
    assert!(backend.primitive_plans().is_empty());
    assert!(backend.mesh_plans().is_empty());
    assert!(backend.buffer_plans().is_empty());
    assert!(backend.resource_cache_plans().is_empty());
    assert!(backend.runtime_plans().is_empty());
    assert!(backend.runtime_reports().is_empty());
    assert_eq!(
        backend.diagnostics().resources,
        NativeRenderBackendResourceDiagnostics::default()
    );
}

#[test]
fn propagates_resolved_scroll_clip_to_runtime_scissor() {
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::new(
        WgpuNativeRenderBackendConfig {
            adapter_name: Some("test-adapter".to_string()),
            surface_format: Some("Bgra8UnormSrgb".to_string()),
            present_mode: WgpuPresentMode::Fifo,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        },
    ));
    renderer
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
            &view_with_clipped_ui_scroll(),
        )
        .unwrap();

    let execution_plan = renderer
        .backend()
        .last_execution_plan()
        .expect("expected wgpu execution plan");
    assert!(execution_plan
        .passes
        .iter()
        .flat_map(|pass| pass.operations.iter())
        .any(|operation| matches!(
            operation,
            WgpuNativeRenderExecutionOperation::SetScissor { depth: 1, .. }
        )));

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected runtime plan");
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
    assert!(scissor.width <= physical_bounds.width);
    assert!(scissor.y >= physical_bounds.y);
}
