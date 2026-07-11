use std::time::Instant;

use crate::renderer::{NativeRenderer, WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig};

use super::fixtures::{bench_layout, heavy_ui_view};
use super::WGPU_STABLE_SUBMIT_ITERATIONS;

#[test]
fn bench_smoke_reuses_stable_wgpu_submission_under_frame_budget() {
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::new(
        WgpuNativeRenderBackendConfig::default(),
    ));
    renderer
        .prepare_and_render(bench_layout(), &heavy_ui_view(320))
        .expect("initial heavy UI frame should render");

    let start = Instant::now();
    for _ in 0..WGPU_STABLE_SUBMIT_ITERATIONS {
        renderer
            .render_frame()
            .expect("stable heavy UI frame should submit");
    }
    let elapsed = start.elapsed();
    let elapsed_ms = elapsed.as_secs_f64() * 1_000.0;
    let average_frame_ms = elapsed_ms / WGPU_STABLE_SUBMIT_ITERATIONS as f64;
    let projected_fps = 1_000.0 / average_frame_ms.max(f64::EPSILON);
    println!(
        "{{\"bench\":\"native.wgpu.stable_submit.smoke\",\"iterations\":{},\"commands\":{},\"planReuses\":{},\"elapsedMs\":{:.3},\"averageFrameMs\":{:.3},\"projectedFps\":{:.1}}}",
        WGPU_STABLE_SUBMIT_ITERATIONS,
        renderer.metrics().frame.command_count,
        renderer.backend().stable_plan_reuse_count(),
        elapsed_ms,
        average_frame_ms,
        projected_fps,
    );

    assert_eq!(
        renderer.backend().stable_plan_reuse_count(),
        WGPU_STABLE_SUBMIT_ITERATIONS
    );
    assert_eq!(renderer.backend().draw_plans().len(), 1);
    assert_eq!(renderer.backend().device_plans().len(), 1);
    assert!(
        average_frame_ms < 16.7,
        "stable WGPU submission exceeded the 60 FPS CPU frame budget: {average_frame_ms:.3}ms"
    );
}
