use std::time::Instant;

use crate::renderer::{NativeRenderer, WgpuNativeRenderBackend};

use super::fixtures::{bench_layout, heavy_text_ui_view};
use super::{WGPU_BUFFER_TEXT_ITERATIONS, WGPU_BUFFER_TEXT_NODE_COUNT};

#[test]
fn bench_smoke_builds_heavy_text_wgpu_buffers_under_stable_threshold() {
    let layout = bench_layout();
    let view = heavy_text_ui_view(WGPU_BUFFER_TEXT_NODE_COUNT);
    let backend: WgpuNativeRenderBackend = WgpuNativeRenderBackend::default();
    let mut renderer = NativeRenderer::new(backend);
    let start = Instant::now();

    for _ in 0..WGPU_BUFFER_TEXT_ITERATIONS {
        renderer
            .prepare_and_render(layout.clone(), &view)
            .expect("heavy text UI should render through the in-memory WGPU backend");
    }

    let elapsed = start.elapsed();
    let buffer_plan = renderer
        .backend()
        .last_buffer_plan()
        .expect("WGPU backend should retain the latest buffer plan");

    println!(
        "{{\"bench\":\"native.wgpu_buffer.heavy_ui_text.smoke\",\"iterations\":{},\"nodes\":{},\"passes\":{},\"drawCalls\":{},\"vertices\":{},\"indices\":{},\"skippedQuads\":{},\"elapsedMs\":{:.3}}}",
        WGPU_BUFFER_TEXT_ITERATIONS,
        WGPU_BUFFER_TEXT_NODE_COUNT,
        buffer_plan.pass_count,
        buffer_plan.draw_call_count,
        buffer_plan.vertex_count,
        buffer_plan.index_count,
        buffer_plan.skipped_quad_count,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert!(buffer_plan.pass_count >= 1);
    assert!(buffer_plan.draw_call_count >= WGPU_BUFFER_TEXT_NODE_COUNT);
    assert!(buffer_plan.vertex_count > WGPU_BUFFER_TEXT_NODE_COUNT * 4);
    assert!(buffer_plan.index_count > WGPU_BUFFER_TEXT_NODE_COUNT * 6);
    assert!(buffer_plan.skipped_quad_count <= 1);
    assert!(
        elapsed.as_millis() < 1_500,
        "native WGPU text buffer smoke benchmark exceeded 1500ms: {:?}",
        elapsed
    );
}
