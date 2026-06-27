use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::NativeRenderer;
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
            &ViewProjection {
                background: Some(BackgroundProjection {
                    asset_name: Some("bg/school.png".to_string()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .unwrap();
    let expected_draw_plan = NativeBackendDrawPlan::from_submission(&result.submission);

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
        renderer.backend().config().adapter_name.as_deref(),
        Some("test-adapter")
    );
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
            note: "wgpu-backend feature is enabled, but the real wgpu device/surface bridge is not attached yet."
                .to_string(),
        }
    );
}
