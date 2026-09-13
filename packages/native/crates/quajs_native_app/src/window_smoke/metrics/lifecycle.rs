use crate::texture_sync::NativeTextureBundleLifecycleSyncReport;

use super::NativeWindowSmokeTextureMetrics;

pub(super) fn record_lifecycle_sync(
    metrics: &mut NativeWindowSmokeTextureMetrics,
    lifecycle: &NativeTextureBundleLifecycleSyncReport,
) {
    metrics.lifecycle_sync_count = metrics.lifecycle_sync_count.saturating_add(1);
    if lifecycle.initial_sync {
        metrics.lifecycle_initial_sync_count =
            metrics.lifecycle_initial_sync_count.saturating_add(1);
    }
    metrics.lifecycle_last_observed_bundle_count = lifecycle.observed_bundle_count;
    metrics.lifecycle_last_tracked_package_count = lifecycle.tracked_package_ids.len();
    metrics.lifecycle_last_blocked_package_count = lifecycle.blocked_package_ids.len();
    metrics.lifecycle_release_attempt_count = metrics
        .lifecycle_release_attempt_count
        .saturating_add(lifecycle.release_attempt_count);
    metrics.lifecycle_released_package_count = metrics
        .lifecycle_released_package_count
        .saturating_add(lifecycle.released_package_ids.len());
    metrics.lifecycle_texture_cleanup_error_count = metrics
        .lifecycle_texture_cleanup_error_count
        .saturating_add(lifecycle.texture_cleanup_error_count);
}
