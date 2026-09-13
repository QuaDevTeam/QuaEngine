use std::time::Instant;

use crate::resources::PackageUnloadBlockerReason;

use super::fixtures::package_release_state;
use super::{PACKAGE_RELEASE_ITERATIONS, PACKAGE_RELEASE_RESOURCE_COUNT};

#[test]
fn bench_smoke_releases_runtime_package_resources_under_stable_threshold() {
    let state = package_release_state(PACKAGE_RELEASE_RESOURCE_COUNT);
    let start = Instant::now();
    let mut clean_released_count = 0;
    let mut blocked_count = 0;
    let mut released_bytes = 0;
    let mut blocked_bytes = 0;
    let mut declarative_released_count = 0;
    let mut declarative_blocked_count = 0;
    let mut declarative_released_bytes = 0;
    let mut declarative_blocked_bytes = 0;

    for _ in 0..PACKAGE_RELEASE_ITERATIONS {
        let mut clean_state = state.clone();
        let mut blocked_state = state.clone();
        let clean_release = clean_state.release_package_resources("runtime.clean");
        let blocked_release = blocked_state.release_package_resources("runtime.blocked");
        clean_released_count = clean_release.summary.released_count;
        blocked_count = blocked_release.summary.blocked_count;
        released_bytes = clean_release.summary.released_memory.total_bytes();
        blocked_bytes = blocked_release.summary.blocked_memory.total_bytes();
        declarative_released_count = clean_release.summary.declarative_released_count;
        declarative_blocked_count = blocked_release.summary.declarative_blocked_count;
        declarative_released_bytes = clean_release
            .summary
            .declarative_released_memory
            .total_bytes();
        declarative_blocked_bytes = blocked_release
            .summary
            .declarative_blocked_memory
            .total_bytes();

        assert_eq!(
            blocked_release
                .summary
                .blocked_by_reason
                .get(&PackageUnloadBlockerReason::PackageRequiredByForeignResource)
                .copied(),
            Some(PACKAGE_RELEASE_RESOURCE_COUNT / 4),
        );
        assert_eq!(
            blocked_release
                .summary
                .blocked_by_reason
                .get(&PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage)
                .copied(),
            Some(PACKAGE_RELEASE_RESOURCE_COUNT / 4),
        );
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.package_release.summary.smoke\",\"iterations\":{},\"resources\":{},\"released\":{},\"blocked\":{},\"releasedBytes\":{},\"blockedBytes\":{},\"declarativeReleased\":{},\"declarativeBlocked\":{},\"declarativeReleasedBytes\":{},\"declarativeBlockedBytes\":{},\"elapsedMs\":{:.3}}}",
        PACKAGE_RELEASE_ITERATIONS,
        PACKAGE_RELEASE_RESOURCE_COUNT,
        clean_released_count,
        blocked_count,
        released_bytes,
        blocked_bytes,
        declarative_released_count,
        declarative_blocked_count,
        declarative_released_bytes,
        declarative_blocked_bytes,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(clean_released_count, PACKAGE_RELEASE_RESOURCE_COUNT / 2);
    assert_eq!(blocked_count, PACKAGE_RELEASE_RESOURCE_COUNT / 2);
    assert_eq!(
        declarative_released_count,
        PACKAGE_RELEASE_RESOURCE_COUNT / 4
    );
    assert_eq!(
        declarative_blocked_count,
        PACKAGE_RELEASE_RESOURCE_COUNT / 4
    );
    assert!(released_bytes > 0);
    assert!(blocked_bytes > 0);
    assert!(declarative_released_bytes > 0);
    assert!(declarative_blocked_bytes > 0);
    assert!(
        elapsed.as_millis() < 1_000,
        "native package release smoke benchmark exceeded 1000ms: {:?}",
        elapsed
    );
}
