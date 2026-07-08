use quajs_wgpu_renderer::audio::{
    AudioBackendCommandPlan, NativeAudioBackend, NullNativeAudioBackend,
};
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncReport, NativeTextureCleanedClearResult,
    NativeTextureHostCleanupSyncFailure, NativeTextureHostCleanupSyncReport,
    NativeTextureReleaseHostSyncFailure, NativeTextureUploadHostSyncFailure,
    NativeTextureUploadHostSyncFailureKind, NativeTextureUploadHostSyncReport,
};

use super::*;

#[test]
fn records_last_frame_upload_state_and_accumulates_counts() {
    let mut metrics = NativeWindowSmokeTextureMetrics::default();

    metrics.record_texture_sync(
        &upload_report(3, 1, 2, 1, 1),
        &cleanup_report(1),
        true,
        &lifecycle_report(true, 2, &["base", "dlc"], &[], 0, &[], 0),
    );
    metrics.record_texture_sync(
        &upload_report(0, 3, 1, 0, 0),
        &cleanup_report(0),
        false,
        &lifecycle_report(false, 1, &["base"], &["dlc"], 1, &["dlc"], 2),
    );

    assert_eq!(metrics.upload_last_pending_request_count, 0);
    assert_eq!(metrics.upload_last_already_resident_count, 3);
    assert_eq!(metrics.upload_uploaded_count, 3);
    assert_eq!(metrics.upload_error_count, 3);
    assert_eq!(metrics.upload_resubmit_count, 1);
    assert!(metrics.resubmitted_after_texture_upload());
    assert_eq!(metrics.lifecycle_sync_count, 2);
    assert_eq!(metrics.lifecycle_initial_sync_count, 1);
    assert_eq!(metrics.lifecycle_last_observed_bundle_count, 1);
    assert_eq!(metrics.lifecycle_last_tracked_package_count, 1);
    assert_eq!(metrics.lifecycle_last_blocked_package_count, 1);
    assert_eq!(metrics.lifecycle_release_attempt_count, 1);
    assert_eq!(metrics.lifecycle_released_package_count, 1);
    assert_eq!(metrics.lifecycle_texture_cleanup_error_count, 2);
}

#[test]
fn records_shutdown_cleanup_counts_separately_from_frame_texture_sync() {
    let mut metrics = NativeWindowSmokeTextureMetrics::default();

    metrics.record_shutdown_cleanup(&NativeTextureCleanedClearResult {
        released_resources: vec![
            NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture),
            NativeResourceRecord::new("qss:menu.qss", NativeResourceKind::QssStyle),
        ],
        host_cleanup: vec![
            quajs_wgpu_renderer::renderer::NativeRendererHostCleanupRecord {
                resource_id: ResourceId::from("images:bg.png"),
                kind: NativeResourceKind::Texture,
                declarative_asset: false,
                owner_package_id: Some("base".to_string()),
                required_package_ids: Vec::new(),
                memory: Default::default(),
                label: None,
            },
            quajs_wgpu_renderer::renderer::NativeRendererHostCleanupRecord {
                resource_id: ResourceId::from("qss:menu.qss"),
                kind: NativeResourceKind::QssStyle,
                declarative_asset: true,
                owner_package_id: Some("base".to_string()),
                required_package_ids: Vec::new(),
                memory: Default::default(),
                label: None,
            },
        ],
        texture_cleanup_report: NativeTextureHostCleanupSyncReport {
            released_count: 1,
            release_error_count: 1,
            ..Default::default()
        },
        font_atlas_report: None,
    });

    assert_eq!(metrics.shutdown_count, 1);
    assert_eq!(metrics.shutdown_released_resource_count, 2);
    assert_eq!(metrics.shutdown_host_cleanup_count, 2);
    assert_eq!(metrics.shutdown_texture_released_count, 1);
    assert_eq!(metrics.shutdown_texture_cleanup_error_count, 1);
    assert_eq!(metrics.upload_error_count, 0);
    assert_eq!(metrics.lifecycle_sync_count, 0);
}

#[test]
fn derives_audio_metrics_from_null_backend_diagnostics() {
    let mut backend = NullNativeAudioBackend::new();
    backend
        .apply_audio_commands(&AudioBackendCommandPlan::default())
        .expect("null backend should accept empty audio command plans");

    let metrics = NativeWindowSmokeAudioMetrics::from_null_backend(Some(&backend));

    assert_eq!(metrics.applied_plan_count, 1);
    assert_eq!(metrics.applied_command_count, 0);
    assert_eq!(metrics.active_track_count, 0);
    assert_eq!(
        NativeWindowSmokeAudioMetrics::from_null_backend(None),
        NativeWindowSmokeAudioMetrics::default()
    );
}

fn upload_report(
    pending: usize,
    resident: usize,
    uploaded: usize,
    failures: usize,
    release_failures: usize,
) -> NativeTextureUploadHostSyncReport {
    NativeTextureUploadHostSyncReport {
        pending_request_count: pending,
        already_resident_count: resident,
        uploaded_count: uploaded,
        failures: (0..failures)
            .map(|index| NativeTextureUploadHostSyncFailure {
                kind: NativeTextureUploadHostSyncFailureKind::UploadError,
                resource_id: ResourceId::from(format!("upload-{index}")),
                asset_type: "images".to_string(),
                asset_name: format!("ui/{index}.png"),
                bundle_name: None,
                package_id: None,
                message: "upload failed".to_string(),
            })
            .collect(),
        release_failures: (0..release_failures)
            .map(|index| NativeTextureReleaseHostSyncFailure {
                resource_id: ResourceId::from(format!("orphan-{index}")),
                message: "release failed".to_string(),
            })
            .collect(),
        ..Default::default()
    }
}

fn cleanup_report(failures: usize) -> NativeTextureHostCleanupSyncReport {
    NativeTextureHostCleanupSyncReport {
        release_failures: (0..failures)
            .map(|index| NativeTextureHostCleanupSyncFailure {
                resource_id: ResourceId::from(format!("cleanup-{index}")),
                message: "cleanup failed".to_string(),
            })
            .collect(),
        ..Default::default()
    }
}

fn lifecycle_report(
    initial_sync: bool,
    observed_bundle_count: usize,
    tracked: &[&str],
    blocked: &[&str],
    release_attempt_count: usize,
    released: &[&str],
    texture_cleanup_error_count: usize,
) -> NativeTextureBundleLifecycleSyncReport {
    NativeTextureBundleLifecycleSyncReport {
        initial_sync,
        observed_bundle_count,
        tracked_package_ids: tracked.iter().map(|id| id.to_string()).collect(),
        blocked_package_ids: blocked.iter().map(|id| id.to_string()).collect(),
        release_attempt_count,
        released_package_ids: released.iter().map(|id| id.to_string()).collect(),
        texture_cleanup_error_count,
        ..Default::default()
    }
}
