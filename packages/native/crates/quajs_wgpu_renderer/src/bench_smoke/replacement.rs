use std::time::Instant;

use crate::resources::NativeResourceKind;

use super::fixtures::{bench_layout, replacement_pressure_state, replacement_pressure_view};
use super::{RESOURCE_REPLACEMENT_ITERATIONS, RESOURCE_REPLACEMENT_RESOURCE_COUNT};

#[test]
fn bench_smoke_reports_replaced_frame_resource_cleanup_under_stable_threshold() {
    let layout = bench_layout();
    let view = replacement_pressure_view(RESOURCE_REPLACEMENT_RESOURCE_COUNT);
    let state = replacement_pressure_state(RESOURCE_REPLACEMENT_RESOURCE_COUNT);
    let start = Instant::now();
    let mut replacement_release_count = 0;
    let mut released_count = 0;
    let mut cleanup_count = 0;
    let mut replaced_bytes = 0;
    let mut declarative_released_count = 0;
    let mut declarative_released_bytes = 0;

    for _ in 0..RESOURCE_REPLACEMENT_ITERATIONS {
        let mut replacement_state = state.clone();
        let update = replacement_state.prepare_frame(layout.clone(), &view);
        replacement_release_count = update.resource_sync_summary.replacement_release_count;
        released_count = update.resource_sync_summary.released_count;
        cleanup_count = update.host_cleanup.len();
        replaced_bytes = update.resource_sync_summary.released_memory.total_bytes();
        declarative_released_count = update.resource_sync_summary.declarative_released_count;
        declarative_released_bytes = update
            .resource_sync_summary
            .declarative_released_memory
            .total_bytes();

        assert!(update.resource_sync.release.is_empty());
        assert_eq!(
            update.resource_sync_summary.upsert_count,
            RESOURCE_REPLACEMENT_RESOURCE_COUNT
        );
        assert_eq!(
            update.resource_sync_summary.released_by_kind[&NativeResourceKind::Texture],
            RESOURCE_REPLACEMENT_RESOURCE_COUNT / 4
        );
        assert_eq!(
            update.resource_sync_summary.released_by_kind[&NativeResourceKind::Buffer],
            RESOURCE_REPLACEMENT_RESOURCE_COUNT / 4
        );
        assert_eq!(
            update.resource_sync_summary.released_by_kind[&NativeResourceKind::QssStyle],
            RESOURCE_REPLACEMENT_RESOURCE_COUNT / 4
        );
        assert_eq!(
            update.resource_sync_summary.released_by_kind[&NativeResourceKind::TokenTable],
            RESOURCE_REPLACEMENT_RESOURCE_COUNT / 4
        );
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.frame_resource_replacement.summary.smoke\",\"iterations\":{},\"resources\":{},\"replacementReleases\":{},\"released\":{},\"hostCleanup\":{},\"replacedBytes\":{},\"declarativeReleased\":{},\"declarativeReleasedBytes\":{},\"elapsedMs\":{:.3}}}",
        RESOURCE_REPLACEMENT_ITERATIONS,
        RESOURCE_REPLACEMENT_RESOURCE_COUNT,
        replacement_release_count,
        released_count,
        cleanup_count,
        replaced_bytes,
        declarative_released_count,
        declarative_released_bytes,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(
        replacement_release_count,
        RESOURCE_REPLACEMENT_RESOURCE_COUNT
    );
    assert_eq!(released_count, RESOURCE_REPLACEMENT_RESOURCE_COUNT);
    assert_eq!(cleanup_count, RESOURCE_REPLACEMENT_RESOURCE_COUNT);
    assert_eq!(
        declarative_released_count,
        RESOURCE_REPLACEMENT_RESOURCE_COUNT / 2
    );
    assert!(replaced_bytes > 0);
    assert!(declarative_released_bytes > 0);
    assert!(
        elapsed.as_millis() < 1_000,
        "native frame resource replacement smoke benchmark exceeded 1000ms: {:?}",
        elapsed
    );
}
