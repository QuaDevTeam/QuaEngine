use crate::texture_sync::{NativeTextureHostCleanupSyncReport, NativeTextureUploadHostSyncReport};

use super::NativeWindowSmokeTextureMetrics;

pub(super) fn record_upload_frame(
    metrics: &mut NativeWindowSmokeTextureMetrics,
    upload_report: &NativeTextureUploadHostSyncReport,
    cleanup_report: &NativeTextureHostCleanupSyncReport,
    resubmitted_after_texture_upload: bool,
) {
    metrics.upload_last_pending_request_count = upload_report.pending_request_count;
    metrics.upload_last_already_resident_count = upload_report.already_resident_count;
    metrics.upload_uploaded_count = metrics
        .upload_uploaded_count
        .saturating_add(upload_report.uploaded_count);
    metrics.upload_error_count = metrics
        .upload_error_count
        .saturating_add(texture_sync_error_count(upload_report, cleanup_report));
    if resubmitted_after_texture_upload {
        metrics.upload_resubmit_count = metrics.upload_resubmit_count.saturating_add(1);
    }
}

fn texture_sync_error_count(
    upload_report: &NativeTextureUploadHostSyncReport,
    cleanup_report: &NativeTextureHostCleanupSyncReport,
) -> usize {
    upload_report
        .failures
        .len()
        .saturating_add(upload_report.release_failures.len())
        .saturating_add(cleanup_report.release_failures.len())
}
