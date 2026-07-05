use quajs_wgpu_renderer::audio::NullNativeAudioBackend;

use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncReport, NativeTextureHostCleanupSyncReport,
    NativeTextureUploadHostSyncReport,
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
