use std::collections::BTreeSet;

use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendCommand, AudioBackendTrackState,
};
use quajs_wgpu_renderer::resources::ResourceId;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeAudioAssetMetadata {
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeAudioAssetHostSyncLoad {
    pub backend_load: AudioBackendAssetLoad,
    pub bundle_name: Option<String>,
    pub metadata: NativeAudioAssetMetadata,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeAudioAssetHostSyncReport {
    pub command_count: usize,
    pub load_asset_command_count: usize,
    pub ignored_command_count: usize,
    pub loaded_count: usize,
    pub invalid_command_count: usize,
    pub missing_asset_count: usize,
    pub host_error_count: usize,
    pub loaded_assets: Vec<NativeAudioAssetHostSyncLoad>,
    pub failures: Vec<NativeAudioAssetHostSyncFailure>,
}

impl NativeAudioAssetHostSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.failures.is_empty()
    }

    pub(super) fn record_loaded(&mut self, loaded: NativeAudioAssetHostSyncLoad) {
        self.loaded_count += 1;
        self.loaded_assets.push(loaded);
    }

    pub fn backend_asset_loads(&self) -> Vec<AudioBackendAssetLoad> {
        self.loaded_assets
            .iter()
            .map(|load| load.backend_load.clone())
            .collect()
    }

    pub(super) fn record_failure(&mut self, failure: NativeAudioAssetHostSyncFailure) {
        match failure.kind {
            NativeAudioAssetHostSyncFailureKind::InvalidCommand => {
                self.invalid_command_count += 1;
            }
            NativeAudioAssetHostSyncFailureKind::MissingAsset => {
                self.missing_asset_count += 1;
            }
            NativeAudioAssetHostSyncFailureKind::HostError => {
                self.host_error_count += 1;
            }
        }
        self.failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeAudioAssetHostSyncFailure {
    pub kind: NativeAudioAssetHostSyncFailureKind,
    pub track_id: Option<String>,
    pub resource_id: Option<ResourceId>,
    pub asset_type: Option<String>,
    pub asset_name: Option<String>,
    pub bundle_name: Option<String>,
    pub package_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeAudioAssetHostSyncFailureKind {
    InvalidCommand,
    MissingAsset,
    HostError,
}

pub(super) fn metadata_from_track(
    track: &AudioBackendTrackState,
    selected_package_id: Option<&str>,
) -> NativeAudioAssetMetadata {
    let owner_package_id = selected_package_id
        .map(ToString::to_string)
        .or_else(|| single_owner(&track.package_candidates));
    let mut required_package_ids = track.package_candidates.clone();
    if let Some(owner_package_id) = &owner_package_id {
        required_package_ids.remove(owner_package_id);
    }

    NativeAudioAssetMetadata {
        owner_package_id,
        required_package_ids,
    }
}

pub(super) fn failure_from_track(
    kind: NativeAudioAssetHostSyncFailureKind,
    track: &AudioBackendTrackState,
    bundle_name: Option<String>,
    package_id: Option<String>,
    message: String,
) -> NativeAudioAssetHostSyncFailure {
    NativeAudioAssetHostSyncFailure {
        kind,
        track_id: Some(track.id.clone()),
        resource_id: Some(track.media_resource_id.clone()),
        asset_type: Some(track.asset_type.clone()),
        asset_name: Some(track.asset_name.clone()),
        bundle_name,
        package_id,
        message,
    }
}

pub(super) fn failure_from_command(
    command: &AudioBackendCommand,
    message: String,
) -> NativeAudioAssetHostSyncFailure {
    NativeAudioAssetHostSyncFailure {
        kind: NativeAudioAssetHostSyncFailureKind::InvalidCommand,
        track_id: Some(command.track_id.clone()),
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
