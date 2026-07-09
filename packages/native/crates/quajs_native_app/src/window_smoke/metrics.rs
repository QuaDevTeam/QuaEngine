#[cfg(feature = "native-audio-rodio")]
use crate::audio_backend::RodioNativeAudioBackend;
#[cfg(feature = "native-video-gif")]
use crate::video_backend::GifNativeVideoBackend;
#[cfg(any(test, not(feature = "native-audio-rodio")))]
use quajs_wgpu_renderer::audio::NullNativeAudioBackend;
#[cfg(any(test, not(feature = "native-video-gif")))]
use quajs_wgpu_renderer::video::NullNativeVideoBackend;

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
    pub shutdown_video_frame_texture_uploaded_count: usize,
    pub shutdown_video_frame_texture_released_count: usize,
    pub shutdown_video_frame_texture_error_count: usize,
    pub shutdown_font_atlas_uploaded_count: usize,
    pub shutdown_font_atlas_released_count: usize,
    pub shutdown_font_atlas_error_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeAudioMetrics {
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_track_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeVideoMetrics {
    pub loaded_asset_count: usize,
    pub resident_asset_count: usize,
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_stream_count: usize,
    pub decoded_stream_count: usize,
    pub decode_failure_count: usize,
    pub missing_asset_count: usize,
    pub published_frame_count: usize,
    pub pending_frame_count: usize,
    pub released_texture_count: usize,
    pub pending_release_count: usize,
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

    pub(super) fn record_lifecycle_sync(
        &mut self,
        lifecycle: &NativeTextureBundleLifecycleSyncReport,
    ) {
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
        if let Some(video_report) = &cleanup.video_frame_texture_report {
            self.shutdown_video_frame_texture_uploaded_count = self
                .shutdown_video_frame_texture_uploaded_count
                .saturating_add(video_report.uploaded_count);
            self.shutdown_video_frame_texture_released_count = self
                .shutdown_video_frame_texture_released_count
                .saturating_add(video_report.released_count);
            self.shutdown_video_frame_texture_error_count = self
                .shutdown_video_frame_texture_error_count
                .saturating_add(video_report.missing_release_count)
                .saturating_add(video_report.invalid_frame_count)
                .saturating_add(video_report.upload_error_count)
                .saturating_add(video_report.release_error_count);
        }
        if let Some(font_report) = &cleanup.font_atlas_report {
            self.shutdown_font_atlas_uploaded_count = self
                .shutdown_font_atlas_uploaded_count
                .saturating_add(font_report.uploaded_count);
            self.shutdown_font_atlas_released_count = self
                .shutdown_font_atlas_released_count
                .saturating_add(font_report.released_count);
            self.shutdown_font_atlas_error_count = self
                .shutdown_font_atlas_error_count
                .saturating_add(font_report.missing_release_count)
                .saturating_add(font_report.invalid_atlas_count)
                .saturating_add(font_report.upload_error_count)
                .saturating_add(font_report.release_error_count);
        }
    }
}

impl NativeWindowSmokeAudioMetrics {
    #[cfg(not(feature = "native-audio-rodio"))]
    pub(super) fn from_product_backend(backend: Option<&NullNativeAudioBackend>) -> Self {
        Self::from_null_backend(backend)
    }

    #[cfg(feature = "native-audio-rodio")]
    pub(super) fn from_product_backend(backend: Option<&RodioNativeAudioBackend>) -> Self {
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

    #[cfg(any(test, not(feature = "native-audio-rodio")))]
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

impl NativeWindowSmokeVideoMetrics {
    #[cfg(not(feature = "native-video-gif"))]
    pub(super) fn from_product_backend(backend: Option<&NullNativeVideoBackend>) -> Self {
        Self::from_null_backend(backend)
    }

    #[cfg(feature = "native-video-gif")]
    pub(super) fn from_product_backend(backend: Option<&GifNativeVideoBackend>) -> Self {
        let Some(backend) = backend else {
            return Self::default();
        };
        let diagnostics = backend.diagnostics();
        Self {
            loaded_asset_count: diagnostics.loaded_asset_count,
            resident_asset_count: diagnostics.resident_asset_count,
            applied_plan_count: diagnostics.applied_plan_count,
            applied_command_count: diagnostics.applied_command_count,
            active_stream_count: diagnostics.active_stream_count,
            decoded_stream_count: diagnostics.decoded_stream_count,
            decode_failure_count: diagnostics.decode_failure_count,
            missing_asset_count: diagnostics.missing_asset_count,
            published_frame_count: diagnostics.published_frame_count,
            pending_frame_count: diagnostics.pending_frame_count,
            released_texture_count: diagnostics.released_texture_count,
            pending_release_count: diagnostics.pending_release_count,
        }
    }

    #[cfg(any(test, not(feature = "native-video-gif")))]
    pub(super) fn from_null_backend(backend: Option<&NullNativeVideoBackend>) -> Self {
        let Some(backend) = backend else {
            return Self::default();
        };
        let diagnostics = backend.diagnostics();
        Self {
            loaded_asset_count: diagnostics.loaded_asset_count,
            resident_asset_count: diagnostics.loaded_asset_count,
            applied_plan_count: diagnostics.applied_plan_count,
            applied_command_count: diagnostics.applied_command_count,
            active_stream_count: diagnostics.active_stream_count,
            ..Default::default()
        }
    }
}
