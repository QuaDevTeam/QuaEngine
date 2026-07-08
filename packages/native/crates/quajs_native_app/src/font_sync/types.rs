use std::collections::BTreeSet;

use quajs_wgpu_renderer::fonts::{FontBackendAssetLoad, FontBackendCommand, FontBackendFaceState};
use quajs_wgpu_renderer::resources::ResourceId;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeFontAssetMetadata {
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeFontAssetHostSyncLoad {
    pub backend_load: FontBackendAssetLoad,
    pub bundle_name: Option<String>,
    pub metadata: NativeFontAssetMetadata,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeFontAssetHostSyncReport {
    pub command_count: usize,
    pub load_face_command_count: usize,
    pub ignored_command_count: usize,
    pub loaded_count: usize,
    pub invalid_command_count: usize,
    pub missing_asset_count: usize,
    pub host_error_count: usize,
    pub loaded_assets: Vec<NativeFontAssetHostSyncLoad>,
    pub failures: Vec<NativeFontAssetHostSyncFailure>,
}

impl NativeFontAssetHostSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.failures.is_empty()
    }

    pub(super) fn record_loaded(&mut self, loaded: NativeFontAssetHostSyncLoad) {
        self.loaded_count += 1;
        self.loaded_assets.push(loaded);
    }

    #[allow(dead_code)]
    pub fn backend_asset_loads(&self) -> Vec<FontBackendAssetLoad> {
        self.loaded_assets
            .iter()
            .map(|load| load.backend_load.clone())
            .collect()
    }

    pub(super) fn record_failure(&mut self, failure: NativeFontAssetHostSyncFailure) {
        match failure.kind {
            NativeFontAssetHostSyncFailureKind::InvalidCommand => {
                self.invalid_command_count += 1;
            }
            NativeFontAssetHostSyncFailureKind::MissingAsset => {
                self.missing_asset_count += 1;
            }
            NativeFontAssetHostSyncFailureKind::HostError => {
                self.host_error_count += 1;
            }
        }
        self.failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeFontAssetHostSyncFailure {
    pub kind: NativeFontAssetHostSyncFailureKind,
    pub face_id: Option<String>,
    pub resource_id: Option<ResourceId>,
    pub asset_type: Option<String>,
    pub asset_name: Option<String>,
    pub bundle_name: Option<String>,
    pub package_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeFontAssetHostSyncFailureKind {
    InvalidCommand,
    MissingAsset,
    HostError,
}

pub(super) fn metadata_from_face(
    face: &FontBackendFaceState,
    selected_package_id: Option<&str>,
) -> NativeFontAssetMetadata {
    let owner_package_id = selected_package_id
        .map(ToString::to_string)
        .or_else(|| single_owner(&face.package_candidates));
    let mut required_package_ids = face.package_candidates.clone();
    if let Some(owner_package_id) = &owner_package_id {
        required_package_ids.remove(owner_package_id);
    }

    NativeFontAssetMetadata {
        owner_package_id,
        required_package_ids,
    }
}

pub(super) fn failure_from_face(
    kind: NativeFontAssetHostSyncFailureKind,
    face: &FontBackendFaceState,
    bundle_name: Option<String>,
    package_id: Option<String>,
    message: String,
) -> NativeFontAssetHostSyncFailure {
    NativeFontAssetHostSyncFailure {
        kind,
        face_id: Some(face.id.clone()),
        resource_id: Some(face.face_resource_id.clone()),
        asset_type: Some(face.asset_type.clone()),
        asset_name: Some(face.asset_name.clone()),
        bundle_name,
        package_id,
        message,
    }
}

pub(super) fn failure_from_command(
    command: &FontBackendCommand,
    message: String,
) -> NativeFontAssetHostSyncFailure {
    NativeFontAssetHostSyncFailure {
        kind: NativeFontAssetHostSyncFailureKind::InvalidCommand,
        face_id: Some(command.face_id.clone()),
        resource_id: None,
        asset_type: None,
        asset_name: None,
        bundle_name: None,
        package_id: None,
        message,
    }
}

fn single_owner(package_ids: &BTreeSet<String>) -> Option<String> {
    if package_ids.len() == 1 {
        package_ids.iter().next().cloned()
    } else {
        None
    }
}
