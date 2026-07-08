use quajs_native_runtime::{NativeAssetReadRequest, NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::audio::{
    AudioBackendCommandKind, AudioBackendCommandPlan, AudioBackendTrackState,
};

use crate::host_assets::{
    ordered_package_candidates, resolve_native_asset_read_candidates, NativeAssetBundleCandidate,
};

use super::types::{
    failure_from_command, failure_from_track, metadata_from_track, NativeAudioAssetHostSyncFailure,
    NativeAudioAssetHostSyncFailureKind, NativeAudioAssetHostSyncLoad,
    NativeAudioAssetHostSyncReport,
};
use super::validation::validate_audio_load_command;

pub fn sync_audio_assets_from_host(
    host: &impl NativeHostApi,
    plan: &AudioBackendCommandPlan,
) -> NativeAudioAssetHostSyncReport {
    let mut report = NativeAudioAssetHostSyncReport {
        command_count: plan.commands.len(),
        ..Default::default()
    };

    for command in &plan.commands {
        if !matches!(command.kind, AudioBackendCommandKind::LoadAsset) {
            report.ignored_command_count += 1;
            continue;
        }
        report.load_asset_command_count += 1;

        let track = match validate_audio_load_command(command) {
            Ok(track) => track,
            Err(message) => {
                report.record_failure(failure_from_command(command, message));
                continue;
            }
        };

        match read_audio_asset_bytes(host, track) {
            Ok(read) => {
                report.record_loaded(NativeAudioAssetHostSyncLoad {
                    track_id: track.id.clone(),
                    resource_id: track.media_resource_id.clone(),
                    asset_type: track.asset_type.clone(),
                    asset_name: track.asset_name.clone(),
                    bundle_name: read.bundle_name.clone(),
                    package_id: read.package_id.clone(),
                    bytes: read.bytes,
                    metadata: metadata_from_track(track, read.package_id.as_deref()),
                });
            }
            Err(failure) => report.record_failure(failure),
        }
    }

    report
}

struct NativeAudioAssetRead {
    bytes: Vec<u8>,
    bundle_name: Option<String>,
    package_id: Option<String>,
}

fn read_audio_asset_bytes(
    host: &impl NativeHostApi,
    track: &AudioBackendTrackState,
) -> Result<NativeAudioAssetRead, NativeAudioAssetHostSyncFailure> {
    let candidates = read_candidates(host, track)?;
    let mut last_missing: Option<NativeAudioAssetHostSyncFailure> = None;

    for candidate in candidates {
        let read_request = NativeAssetReadRequest {
            url: track.asset_name.clone(),
            bundle_name: candidate.bundle_name.clone(),
            asset_id: Some(track.media_resource_id.as_str().to_string()),
        };

        match host.read_asset_bytes(&read_request) {
            Ok(bytes) => {
                return Ok(NativeAudioAssetRead {
                    bytes,
                    bundle_name: candidate.bundle_name,
                    package_id: candidate.package_id,
                });
            }
            Err(NativeHostApiError::AssetNotFound(_)) => {
                last_missing = Some(failure_from_track(
                    NativeAudioAssetHostSyncFailureKind::MissingAsset,
                    track,
                    candidate.bundle_name,
                    candidate.package_id,
                    format!("Native audio asset \"{}\" was not found.", track.asset_name),
                ));
            }
            Err(error) => {
                return Err(failure_from_track(
                    NativeAudioAssetHostSyncFailureKind::HostError,
                    track,
                    candidate.bundle_name,
                    candidate.package_id,
                    error.message(),
                ));
            }
        }
    }

    Err(last_missing.unwrap_or_else(|| {
        failure_from_track(
            NativeAudioAssetHostSyncFailureKind::MissingAsset,
            track,
            None,
            None,
            format!("Native audio asset \"{}\" was not found.", track.asset_name),
        )
    }))
}

fn read_candidates(
    host: &impl NativeHostApi,
    track: &AudioBackendTrackState,
) -> Result<Vec<NativeAssetBundleCandidate>, NativeAudioAssetHostSyncFailure> {
    let package_ids = ordered_package_candidates(track.package_candidates.iter());
    let candidates = resolve_native_asset_read_candidates(host, &package_ids).map_err(|error| {
        failure_from_track(
            NativeAudioAssetHostSyncFailureKind::HostError,
            track,
            None,
            None,
            error.message(),
        )
    })?;

    if !package_ids.is_empty() && candidates.is_empty() {
        return Err(failure_from_track(
            NativeAudioAssetHostSyncFailureKind::MissingAsset,
            track,
            None,
            package_ids.first().cloned(),
            format!(
                "Native audio asset \"{}\" could not be resolved because no mounted bundle matched package candidate(s): {}.",
                track.asset_name,
                package_ids.join(", ")
            ),
        ));
    }

    Ok(candidates)
}
