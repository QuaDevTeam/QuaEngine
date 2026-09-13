use std::time::Instant;

use crate::renderer::NativeRendererState;

use super::fixtures::{audio_metrics_view, bench_layout};
use super::{AUDIO_METRICS_ITERATIONS, AUDIO_METRICS_TRACK_COUNT};

#[test]
fn bench_smoke_prepares_audio_metrics_under_stable_threshold() {
    let layout = bench_layout();
    let view = audio_metrics_view(AUDIO_METRICS_TRACK_COUNT);
    let mut state = NativeRendererState::new();
    let start = Instant::now();
    let mut active_track_count = 0;
    let mut audio_resource_count = 0;

    for _ in 0..AUDIO_METRICS_ITERATIONS {
        state.prepare_frame(layout.clone(), &view);
        let metrics = state.metrics();
        active_track_count = metrics.audio_backend.active_track_count;
        audio_resource_count = metrics.resources.audio.resource_count;
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.audio.metrics.smoke\",\"iterations\":{},\"tracks\":{},\"audioResources\":{},\"elapsedMs\":{:.3}}}",
        AUDIO_METRICS_ITERATIONS,
        active_track_count,
        audio_resource_count,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(active_track_count, AUDIO_METRICS_TRACK_COUNT);
    assert_eq!(audio_resource_count, AUDIO_METRICS_TRACK_COUNT * 2);
    assert!(
        elapsed.as_millis() < 750,
        "native audio metrics smoke benchmark exceeded 750ms: {:?}",
        elapsed
    );
}
