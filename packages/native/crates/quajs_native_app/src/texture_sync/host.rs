use quajs_native_runtime::{NativeAssetReadRequest, NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, NativeTextureUploadSyncPlan};

use crate::host_assets::{
    native_asset_read_urls, resolve_native_asset_read_candidates, NativeAssetBundleCandidate,
};

use super::metadata::{ordered_package_candidates, upload_metadata_from_request};
use super::types::{
    failure, NativeTextureReleaseHostSyncFailure, NativeTextureUploadHostSyncFailure,
    NativeTextureUploadHostSyncFailureKind, NativeTextureUploadHostSyncReport,
    NativeTextureUploadSink,
};
use super::validation::validate_texture_upload_request;

pub fn sync_pending_texture_uploads_from_host<H, S>(
    host: &H,
    sink: &mut S,
    sync: &NativeTextureUploadSyncPlan,
) -> NativeTextureUploadHostSyncReport
where
    H: NativeHostApi,
    S: NativeTextureUploadSink,
{
    let mut report = NativeTextureUploadHostSyncReport {
        pending_request_count: sync.pending_requests.len(),
        already_resident_count: sync.resident_resource_ids.len(),
        orphaned_resident_count: sync.orphaned_resident_resource_ids.len(),
        ..Default::default()
    };

    release_orphaned_resident_textures(sink, sync, &mut report);

    for request in &sync.pending_requests {
        if let Err(message) = validate_texture_upload_request(request) {
            report.record_failure(failure(
                NativeTextureUploadHostSyncFailureKind::InvalidRequest,
                request,
                None,
                None,
                message,
            ));
            continue;
        }

        let read = match read_texture_asset_bytes(host, request) {
            Ok(read) => read,
            Err(read_failure) => {
                report.record_failure(read_failure);
                continue;
            }
        };
        let metadata = upload_metadata_from_request(request, read.package_id.as_deref());

        match sink.upload_texture_bytes(request, &read.bytes, metadata) {
            Ok(()) => {
                report.uploaded_count += 1;
                report
                    .uploaded_resource_ids
                    .push(request.resource_id.clone());
            }
            Err(error) => {
                report.record_failure(failure(
                    NativeTextureUploadHostSyncFailureKind::UploadError,
                    request,
                    read.bundle_name,
                    read.package_id,
                    error.to_string(),
                ));
            }
        }
    }

    report
}

fn release_orphaned_resident_textures<S>(
    sink: &mut S,
    sync: &NativeTextureUploadSyncPlan,
    report: &mut NativeTextureUploadHostSyncReport,
) where
    S: NativeTextureUploadSink,
{
    for resource_id in &sync.orphaned_resident_resource_ids {
        match sink.release_texture_resource(resource_id) {
            Ok(true) => {
                report.released_orphaned_count += 1;
                report
                    .released_orphaned_resource_ids
                    .push(resource_id.clone());
            }
            Ok(false) => {}
            Err(error) => {
                report.record_release_failure(NativeTextureReleaseHostSyncFailure {
                    resource_id: resource_id.clone(),
                    message: error.to_string(),
                });
            }
        }
    }
}

struct NativeTextureAssetRead {
    bytes: Vec<u8>,
    bundle_name: Option<String>,
    package_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct NativeTextureAssetReadCandidate(NativeAssetBundleCandidate);

fn read_texture_asset_bytes(
    host: &impl NativeHostApi,
    request: &NativeTextureUploadRequest,
) -> Result<NativeTextureAssetRead, NativeTextureUploadHostSyncFailure> {
    let candidates = read_candidates(host, request)?;
    let mut last_missing: Option<NativeTextureUploadHostSyncFailure> = None;

    for url in native_asset_read_urls(&request.asset_type, &request.asset_name) {
        for candidate in &candidates {
            let read_request = NativeAssetReadRequest {
                url: url.clone(),
                bundle_name: candidate.0.bundle_name.clone(),
                asset_id: Some(request.resource_id.as_str().to_string()),
            };

            match host.read_asset_bytes(&read_request) {
                Ok(bytes) => {
                    return Ok(NativeTextureAssetRead {
                        bytes,
                        bundle_name: candidate.0.bundle_name.clone(),
                        package_id: candidate.0.package_id.clone(),
                    });
                }
                Err(NativeHostApiError::AssetNotFound(_)) => {
                    last_missing = Some(failure(
                        NativeTextureUploadHostSyncFailureKind::MissingAsset,
                        request,
                        candidate.0.bundle_name.clone(),
                        candidate.0.package_id.clone(),
                        format!(
                            "Native texture asset \"{}\" was not found.",
                            request.asset_name
                        ),
                    ));
                }
                Err(error) => {
                    return Err(failure(
                        NativeTextureUploadHostSyncFailureKind::HostError,
                        request,
                        candidate.0.bundle_name.clone(),
                        candidate.0.package_id.clone(),
                        error.message(),
                    ));
                }
            }
        }
    }

    Err(last_missing.unwrap_or_else(|| {
        failure(
            NativeTextureUploadHostSyncFailureKind::MissingAsset,
            request,
            None,
            None,
            format!(
                "Native texture asset \"{}\" was not found.",
                request.asset_name
            ),
        )
    }))
}

fn read_candidates(
    host: &impl NativeHostApi,
    request: &NativeTextureUploadRequest,
) -> Result<Vec<NativeTextureAssetReadCandidate>, NativeTextureUploadHostSyncFailure> {
    let package_ids = ordered_package_candidates(request);
    if package_ids.is_empty() {
        return Ok(resolve_native_asset_read_candidates(host, &[])
            .map_err(|error| {
                failure(
                    NativeTextureUploadHostSyncFailureKind::HostError,
                    request,
                    None,
                    None,
                    error.message(),
                )
            })?
            .into_iter()
            .map(NativeTextureAssetReadCandidate)
            .collect());
    }

    let candidates = resolve_native_asset_read_candidates(host, &package_ids).map_err(|error| {
        failure(
            NativeTextureUploadHostSyncFailureKind::HostError,
            request,
            None,
            None,
            error.message(),
        )
    })?;

    if candidates.is_empty() {
        return Err(failure(
            NativeTextureUploadHostSyncFailureKind::MissingAsset,
            request,
            None,
            package_ids.first().cloned(),
            format!(
                "Native texture asset \"{}\" could not be resolved because no mounted bundle matched package candidate(s): {}.",
                request.asset_name,
                package_ids.join(", ")
            ),
        ));
    }

    Ok(candidates
        .into_iter()
        .map(NativeTextureAssetReadCandidate)
        .collect())
}
