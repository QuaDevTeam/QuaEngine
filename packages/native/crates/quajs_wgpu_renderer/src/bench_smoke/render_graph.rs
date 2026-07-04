use std::time::Instant;

use crate::projection::view::build_view_render_graph;

use super::fixtures::{bench_layout, heavy_ui_view};
use super::RENDER_GRAPH_ITERATIONS;

#[test]
fn bench_smoke_builds_heavy_ui_render_graph_under_stable_threshold() {
    let layout = bench_layout();
    let view = heavy_ui_view(320);
    let start = Instant::now();
    let mut command_count = 0;

    for _ in 0..RENDER_GRAPH_ITERATIONS {
        let graph = build_view_render_graph(layout.clone(), &view);
        command_count = graph.summary().command_count;
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.render_graph.heavy_ui.smoke\",\"iterations\":{},\"commands\":{},\"elapsedMs\":{:.3}}}",
        RENDER_GRAPH_ITERATIONS,
        command_count,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert!(command_count >= 320);
    assert!(
        elapsed.as_millis() < 1_500,
        "native render graph smoke benchmark exceeded 1500ms: {:?}",
        elapsed
    );
}
