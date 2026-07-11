use quajs_native_runtime::{NativeAssetReadRequest, NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::video::{
    VideoBackendAssetLoad, VideoBackendCommandKind, VideoBackendCommandPlan,
    VideoBackendStreamState,
};

use crate::host_assets::{
    native_asset_read_urls, ordered_package_candidates, resolve_native_asset_read_candidates,
    NativeAssetBundleCandidate,
};

use super::types::{
    failure_from_command, failure_from_stream, metadata_from_stream,
    NativeVideoAssetHostSyncFailure, NativeVideoAssetHostSyncFailureKind,
    NativeVideoAssetHostSyncLoad, NativeVideoAssetHostSyncReport,
};
use super::validation::validate_video_load_command;

pub fn sync_video_assets_from_host(
    host: &impl NativeHostApi,
    plan: &VideoBackendCommandPlan,
) -> NativeVideoAssetHostSyncReport {
    let mut report = NativeVideoAssetHostSyncReport {
        command_count: plan.commands.len(),
        ..Default::default()
    };

    for command in &plan.commands {
        if !matches!(command.kind, VideoBackendCommandKind::LoadAsset) {
            report.ignored_command_count += 1;
            continue;
        }
        report.load_asset_command_count += 1;

        let stream = match validate_video_load_command(command) {
            Ok(stream) => stream,
            Err(message) => {
                report.record_failure(failure_from_command(command, message));
                continue;
            }
        };

        match read_video_asset_bytes(host, stream) {
            Ok(read) => {
                report.record_loaded(NativeVideoAssetHostSyncLoad {
                    backend_load: VideoBackendAssetLoad {
                        stream_id: stream.id.clone(),
                        resource_id: stream.decoder_resource_id.clone(),
                        asset_type: stream.asset_type.clone(),
                        asset_name: stream.asset_name.clone(),
                        package_id: read.package_id.clone(),
                        bytes: read.bytes,
                    },
                    bundle_name: read.bundle_name.clone(),
                    metadata: metadata_from_stream(stream, read.package_id.as_deref()),
                });
            }
            Err(failure) => report.record_failure(failure),
        }
    }

    report
}

struct NativeVideoAssetRead {
    bytes: Vec<u8>,
    bundle_name: Option<String>,
    package_id: Option<String>,
}

fn read_video_asset_bytes(
    host: &impl NativeHostApi,
    stream: &VideoBackendStreamState,
) -> Result<NativeVideoAssetRead, NativeVideoAssetHostSyncFailure> {
    let candidates = read_candidates(host, stream)?;
    let mut last_missing: Option<NativeVideoAssetHostSyncFailure> = None;

    for url in native_asset_read_urls(&stream.asset_type, &stream.asset_name) {
        for candidate in &candidates {
            let read_request = NativeAssetReadRequest {
                url: url.clone(),
                bundle_name: candidate.bundle_name.clone(),
                asset_id: Some(stream.decoder_resource_id.as_str().to_string()),
            };

            match host.read_asset_bytes(&read_request) {
                Ok(bytes) => {
                    return Ok(NativeVideoAssetRead {
                        bytes,
                        bundle_name: candidate.bundle_name.clone(),
                        package_id: candidate.package_id.clone(),
                    });
                }
                Err(NativeHostApiError::AssetNotFound(_)) => {
                    last_missing = Some(failure_from_stream(
                        NativeVideoAssetHostSyncFailureKind::MissingAsset,
                        stream,
                        candidate.bundle_name.clone(),
                        candidate.package_id.clone(),
                        format!(
                            "Native video asset \"{}\" was not found.",
                            stream.asset_name
                        ),
                    ));
                }
                Err(error) => {
                    return Err(failure_from_stream(
                        NativeVideoAssetHostSyncFailureKind::HostError,
                        stream,
                        candidate.bundle_name.clone(),
                        candidate.package_id.clone(),
                        error.message(),
                    ));
                }
            }
        }
    }

    Err(last_missing.unwrap_or_else(|| {
        failure_from_stream(
            NativeVideoAssetHostSyncFailureKind::MissingAsset,
            stream,
            None,
            None,
            format!(
                "Native video asset \"{}\" was not found.",
                stream.asset_name
            ),
        )
    }))
}

fn read_candidates(
    host: &impl NativeHostApi,
    stream: &VideoBackendStreamState,
) -> Result<Vec<NativeAssetBundleCandidate>, NativeVideoAssetHostSyncFailure> {
    let package_ids = ordered_package_candidates(stream.package_candidates.iter());
    let candidates = resolve_native_asset_read_candidates(host, &package_ids).map_err(|error| {
        failure_from_stream(
            NativeVideoAssetHostSyncFailureKind::HostError,
            stream,
            None,
            None,
            error.message(),
        )
    })?;

    if !package_ids.is_empty() && candidates.is_empty() {
        return Err(failure_from_stream(
            NativeVideoAssetHostSyncFailureKind::MissingAsset,
            stream,
            None,
            package_ids.first().cloned(),
            format!(
                "Native video asset \"{}\" could not be resolved because no mounted bundle matched package candidate(s): {}.",
                stream.asset_name,
                package_ids.join(", ")
            ),
        ));
    }

    Ok(candidates)
}
