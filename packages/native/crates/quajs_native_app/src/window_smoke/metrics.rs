use quajs_wgpu_renderer::audio::NullNativeAudioBackend;

use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncReport, NativeTextureCleanedClearResult,
    NativeTextureHostCleanupSyncReport, NativeTextureUploadHostSyncReport,
};

mod lifecycle;
#[cfg(test)]
mod tests;
mod upload;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeTextureMetrics {
    pub upload_last_pending_request_count: usize,
    pub upload_last_already_resident_count: usize,
    pub upload_uploaded_count: usize,
    pub upload_error_count: usize,
    pub upload_resubmit_count: usize,
    pub lifecycle_sync_count: usize,
    pub lifecycle_initial_sync_count: usize,
    pub lifecycle_last_observed_bundle_count: usize,
    pub lifecycle_last_tracked_package_count: usize,
    pub lifecycle_last_blocked_package_count: usize,
    pub lifecycle_release_attempt_count: usize,
    pub lifecycle_released_package_count: usize,
    pub lifecycle_texture_cleanup_error_count: usize,
    pub shutdown_count: usize,
    pub shutdown_released_resource_count: usize,
    pub shutdown_host_cleanup_count: usize,
    pub shutdown_texture_released_count: usize,
    pub shutdown_texture_cleanup_error_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeAudioMetrics {
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_track_count: usize,
}

impl NativeWindowSmokeTextureMetrics {
    pub(super) fn record_texture_sync(
        &mut self,
        upload_report: &NativeTextureUploadHostSyncReport,
        cleanup_report: &NativeTextureHostCleanupSyncReport,
        resubmitted_after_texture_upload: bool,
        lifecycle: &NativeTextureBundleLifecycleSyncReport,
    ) {
        upload::record_upload_frame(
            self,
            upload_report,
            cleanup_report,
            resubmitted_after_texture_upload,
        );
        lifecycle::record_lifecycle_sync(self, lifecycle);
    }

    pub(super) fn resubmitted_after_texture_upload(&self) -> bool {
        self.upload_resubmit_count > 0
    }

    pub(super) fn record_shutdown_cleanup(&mut self, cleanup: &NativeTextureCleanedClearResult) {
        self.shutdown_count = self.shutdown_count.saturating_add(1);
        self.shutdown_released_resource_count = self
            .shutdown_released_resource_count
            .saturating_add(cleanup.released_resources.len());
        self.shutdown_host_cleanup_count = self
            .shutdown_host_cleanup_count
            .saturating_add(cleanup.host_cleanup.len());
        self.shutdown_texture_released_count = self
            .shutdown_texture_released_count
            .saturating_add(cleanup.texture_cleanup_report.released_count);
        self.shutdown_texture_cleanup_error_count = self
            .shutdown_texture_cleanup_error_count
            .saturating_add(cleanup.texture_cleanup_report.release_error_count);
    }
}

impl NativeWindowSmokeAudioMetrics {
    pub(super) fn from_null_backend(backend: Option<&NullNativeAudioBackend>) -> Self {
        let Some(backend) = backend else {
            return Self::default();
        };
        let diagnostics = backend.diagnostics();
        Self {
            applied_plan_count: diagnostics.applied_plan_count,
            applied_command_count: diagnostics.applied_command_count,
            active_track_count: diagnostics.active_track_count,
        }
    }
}
