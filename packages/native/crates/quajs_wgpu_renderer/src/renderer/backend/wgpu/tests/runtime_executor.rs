use super::super::*;
use super::fixture::view_with_ui_scroll;
use crate::renderer::NativeRenderer;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[cfg(feature = "real-wgpu-noop")]
mod fixtures;

#[cfg(feature = "real-wgpu-noop")]
mod real_noop;

#[derive(Clone, Debug, Default, PartialEq)]
struct RecordingRuntimeExecutor {
    inner: InMemoryWgpuNativeRenderRuntimeExecutor,
    applied_revision: Option<u64>,
}

impl WgpuNativeRenderRuntimeExecutor for RecordingRuntimeExecutor {
    fn apply_runtime_plan(
        &mut self,
        plan: &WgpuNativeRenderRuntimePlan,
    ) -> WgpuNativeRenderRuntimeResult {
        self.applied_revision = Some(plan.revision);
        self.inner.apply_runtime_plan(plan)
    }

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.inner.snapshot()
    }

    fn device_attached(&self) -> bool {
        true
    }

    fn diagnostic_note(&self) -> &'static str {
        "recording runtime executor is attached"
    }
}

#[test]
fn accepts_custom_runtime_executor_for_future_wgpu_device_bridge() {
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        RecordingRuntimeExecutor::default(),
    );
    let mut renderer = NativeRenderer::new(backend);

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
            &view_with_ui_scroll(),
        )
        .unwrap();

    assert_eq!(
        renderer.backend().runtime_executor().applied_revision,
        Some(1)
    );
    assert_eq!(renderer.backend().runtime_reports().len(), 1);
    assert_eq!(renderer.backend().diagnostics().device_attached, true);
    assert_eq!(
        renderer.backend().diagnostics().note,
        "recording runtime executor is attached"
    );
    assert_eq!(
        renderer.backend().runtime_snapshot(),
        renderer.backend().runtime_executor().runtime_snapshot()
    );
}
