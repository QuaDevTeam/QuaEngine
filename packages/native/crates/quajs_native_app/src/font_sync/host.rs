use quajs_native_runtime::{NativeAssetReadRequest, NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::fonts::{
    FontBackendAssetLoad, FontBackendCommandKind, FontBackendCommandPlan, FontBackendFaceState,
};

use crate::host_assets::{
    ordered_package_candidates, resolve_native_asset_read_candidates, NativeAssetBundleCandidate,
};

use super::types::{
    failure_from_command, failure_from_face, metadata_from_face, NativeFontAssetHostSyncFailure,
    NativeFontAssetHostSyncFailureKind, NativeFontAssetHostSyncLoad, NativeFontAssetHostSyncReport,
};
use super::validation::validate_font_load_command;

pub fn sync_font_assets_from_host(
    host: &impl NativeHostApi,
    plan: &FontBackendCommandPlan,
) -> NativeFontAssetHostSyncReport {
    let mut report = NativeFontAssetHostSyncReport {
        command_count: plan.commands.len(),
        ..Default::default()
    };

    for command in &plan.commands {
        if !matches!(command.kind, FontBackendCommandKind::LoadFace) {
            report.ignored_command_count += 1;
            continue;
        }
        report.load_face_command_count += 1;

        let face = match validate_font_load_command(command) {
            Ok(face) => face,
            Err(message) => {
                report.record_failure(failure_from_command(command, message));
                continue;
            }
        };

        match read_font_asset_bytes(host, face) {
            Ok(read) => {
                report.record_loaded(NativeFontAssetHostSyncLoad {
                    backend_load: FontBackendAssetLoad {
                        face_id: face.id.clone(),
                        resource_id: face.face_resource_id.clone(),
                        asset_type: face.asset_type.clone(),
                        asset_name: face.asset_name.clone(),
                        package_id: read.package_id.clone(),
                        bytes: read.bytes,
                    },
                    bundle_name: read.bundle_name.clone(),
                    metadata: metadata_from_face(face, read.package_id.as_deref()),
                });
            }
            Err(failure) => report.record_failure(failure),
        }
    }

    report
}

struct NativeFontAssetRead {
    bytes: Vec<u8>,
    bundle_name: Option<String>,
    package_id: Option<String>,
}

fn read_font_asset_bytes(
    host: &impl NativeHostApi,
    face: &FontBackendFaceState,
) -> Result<NativeFontAssetRead, NativeFontAssetHostSyncFailure> {
    let candidates = read_candidates(host, face)?;
    let mut last_missing: Option<NativeFontAssetHostSyncFailure> = None;

    for candidate in candidates {
        let read_request = NativeAssetReadRequest {
            url: face.asset_name.clone(),
            bundle_name: candidate.bundle_name.clone(),
            asset_id: Some(face.face_resource_id.as_str().to_string()),
        };

        match host.read_asset_bytes(&read_request) {
            Ok(bytes) => {
                return Ok(NativeFontAssetRead {
                    bytes,
                    bundle_name: candidate.bundle_name,
                    package_id: candidate.package_id,
                });
            }
            Err(NativeHostApiError::AssetNotFound(_)) => {
                last_missing = Some(failure_from_face(
                    NativeFontAssetHostSyncFailureKind::MissingAsset,
                    face,
                    candidate.bundle_name,
                    candidate.package_id,
                    format!("Native font asset \"{}\" was not found.", face.asset_name),
                ));
            }
            Err(error) => {
                return Err(failure_from_face(
                    NativeFontAssetHostSyncFailureKind::HostError,
                    face,
                    candidate.bundle_name,
                    candidate.package_id,
                    error.message(),
                ));
            }
        }
    }

    Err(last_missing.unwrap_or_else(|| {
        failure_from_face(
            NativeFontAssetHostSyncFailureKind::MissingAsset,
            face,
            None,
            None,
            format!("Native font asset \"{}\" was not found.", face.asset_name),
        )
    }))
}

fn read_candidates(
    host: &impl NativeHostApi,
    face: &FontBackendFaceState,
) -> Result<Vec<NativeAssetBundleCandidate>, NativeFontAssetHostSyncFailure> {
    let package_ids = ordered_package_candidates(face.package_candidates.iter());
    let candidates = resolve_native_asset_read_candidates(host, &package_ids).map_err(|error| {
        failure_from_face(
            NativeFontAssetHostSyncFailureKind::HostError,
            face,
            None,
            None,
            error.message(),
        )
    })?;

    if !package_ids.is_empty() && candidates.is_empty() {
        return Err(failure_from_face(
            NativeFontAssetHostSyncFailureKind::MissingAsset,
            face,
            None,
            package_ids.first().cloned(),
            format!(
                "Native font asset \"{}\" could not be resolved because no mounted bundle matched package candidate(s): {}.",
                face.asset_name,
                package_ids.join(", ")
            ),
        ));
    }

    Ok(candidates)
}
