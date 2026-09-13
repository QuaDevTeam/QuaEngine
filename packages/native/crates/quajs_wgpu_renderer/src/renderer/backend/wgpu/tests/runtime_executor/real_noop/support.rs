use super::*;

pub(super) type RealNoopRuntimeExecutor =
    InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>;
pub(super) type RealNoopBackend = WgpuNativeRenderBackend<RealNoopRuntimeExecutor>;

pub(super) fn create_noop_renderer(width: u32, height: u32) -> NativeRenderer<RealNoopBackend, ()> {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(width, height);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    NativeRenderer::new(backend)
}

pub(super) fn landscape_layout(
    width: f64,
    height: f64,
) -> crate::stage_layout::ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(width),
            height: Some(height),
            ..Default::default()
        },
    )
}

pub(super) fn assert_frame_target_matches_report(
    backend: &RealNoopBackend,
    report: &WgpuNativeRenderRuntimeExecutionReport,
    expected_extent: Option<(u32, u32)>,
) {
    let frame_target = backend.runtime_executor().device().frame_target_snapshot();
    assert_eq!(frame_target.completed_pass_count, report.render_pass_count);
    if let Some((width, height)) = expected_extent {
        assert_eq!(frame_target.extent.width, width);
        assert_eq!(frame_target.extent.height, height);
    }
}
