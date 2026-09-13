use std::collections::BTreeSet;

use quajs_wgpu_renderer::resources::ResourceId;
use quajs_wgpu_renderer::video::{
    VideoBackendAssetLoad, VideoBackendCommand, VideoBackendStreamState,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeVideoAssetMetadata {
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeVideoAssetHostSyncLoad {
    pub backend_load: VideoBackendAssetLoad,
    pub bundle_name: Option<String>,
    pub metadata: NativeVideoAssetMetadata,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeVideoAssetHostSyncReport {
    pub command_count: usize,
    pub load_asset_command_count: usize,
    pub ignored_command_count: usize,
    pub loaded_count: usize,
    pub invalid_command_count: usize,
    pub missing_asset_count: usize,
    pub host_error_count: usize,
    pub loaded_assets: Vec<NativeVideoAssetHostSyncLoad>,
    pub failures: Vec<NativeVideoAssetHostSyncFailure>,
}

impl NativeVideoAssetHostSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.failures.is_empty()
    }

    pub(super) fn record_loaded(&mut self, loaded: NativeVideoAssetHostSyncLoad) {
        self.loaded_count += 1;
        self.loaded_assets.push(loaded);
    }

    pub fn backend_asset_loads(&self) -> Vec<VideoBackendAssetLoad> {
        self.loaded_assets
            .iter()
            .map(|load| load.backend_load.clone())
            .collect()
    }

    pub(super) fn record_failure(&mut self, failure: NativeVideoAssetHostSyncFailure) {
        match failure.kind {
            NativeVideoAssetHostSyncFailureKind::InvalidCommand => {
                self.invalid_command_count += 1;
            }
            NativeVideoAssetHostSyncFailureKind::MissingAsset => {
                self.missing_asset_count += 1;
            }
            NativeVideoAssetHostSyncFailureKind::HostError => {
                self.host_error_count += 1;
            }
        }
        self.failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeVideoAssetHostSyncFailure {
    pub kind: NativeVideoAssetHostSyncFailureKind,
    pub stream_id: Option<String>,
    pub resource_id: Option<ResourceId>,
    pub asset_type: Option<String>,
    pub asset_name: Option<String>,
    pub bundle_name: Option<String>,
    pub package_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeVideoAssetHostSyncFailureKind {
    InvalidCommand,
    MissingAsset,
    HostError,
}

pub(super) fn metadata_from_stream(
    stream: &VideoBackendStreamState,
    selected_package_id: Option<&str>,
) -> NativeVideoAssetMetadata {
    let owner_package_id = selected_package_id
        .map(ToString::to_string)
        .or_else(|| single_owner(&stream.package_candidates));
    let mut required_package_ids = stream.package_candidates.clone();
    if let Some(owner_package_id) = &owner_package_id {
        required_package_ids.remove(owner_package_id);
    }

    NativeVideoAssetMetadata {
        owner_package_id,
        required_package_ids,
    }
}

pub(super) fn failure_from_stream(
    kind: NativeVideoAssetHostSyncFailureKind,
    stream: &VideoBackendStreamState,
    bundle_name: Option<String>,
    package_id: Option<String>,
    message: String,
) -> NativeVideoAssetHostSyncFailure {
    NativeVideoAssetHostSyncFailure {
        kind,
        stream_id: Some(stream.id.clone()),
        resource_id: Some(stream.decoder_resource_id.clone()),
        asset_type: Some(stream.asset_type.clone()),
        asset_name: Some(stream.asset_name.clone()),
        bundle_name,
        package_id,
        message,
    }
}

pub(super) fn failure_from_command(
    command: &VideoBackendCommand,
    message: String,
) -> NativeVideoAssetHostSyncFailure {
    NativeVideoAssetHostSyncFailure {
        kind: NativeVideoAssetHostSyncFailureKind::InvalidCommand,
        stream_id: Some(command.stream_id.clone()),
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
