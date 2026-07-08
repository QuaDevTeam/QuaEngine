use std::collections::BTreeSet;
use std::fmt::Display;

use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureUploadMetadata {
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

pub trait NativeTextureUploadSink {
    type Error: Display;

    fn upload_texture_bytes(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error>;

    fn upload_decoded_texture_rgba8(
        &mut self,
        resource_id: &ResourceId,
        width: u32,
        height: u32,
        rgba: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error>;

    fn release_texture_resource(&mut self, _resource_id: &ResourceId) -> Result<bool, Self::Error> {
        Ok(false)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeFontAtlasTextureSyncReport {
    pub pending_upload_count: usize,
    pub release_candidate_count: usize,
    pub uploaded_count: usize,
    pub released_count: usize,
    pub missing_release_count: usize,
    pub invalid_atlas_count: usize,
    pub upload_error_count: usize,
    pub release_error_count: usize,
    pub uploaded_resource_ids: Vec<ResourceId>,
    pub released_resource_ids: Vec<ResourceId>,
    pub missing_release_resource_ids: Vec<ResourceId>,
    pub failures: Vec<NativeFontAtlasTextureSyncFailure>,
    pub release_failures: Vec<NativeTextureReleaseHostSyncFailure>,
}

impl NativeFontAtlasTextureSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.failures.is_empty() && self.release_failures.is_empty()
    }

    pub(super) fn record_failure(&mut self, failure: NativeFontAtlasTextureSyncFailure) {
        match failure.kind {
            NativeFontAtlasTextureSyncFailureKind::InvalidAtlas => {
                self.invalid_atlas_count += 1;
            }
            NativeFontAtlasTextureSyncFailureKind::UploadError => {
                self.upload_error_count += 1;
            }
        }
        self.failures.push(failure);
    }

    pub(super) fn record_release_failure(&mut self, failure: NativeTextureReleaseHostSyncFailure) {
        self.release_error_count += 1;
        self.release_failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeFontAtlasTextureSyncFailure {
    pub kind: NativeFontAtlasTextureSyncFailureKind,
    pub resource_id: ResourceId,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeFontAtlasTextureSyncFailureKind {
    InvalidAtlas,
    UploadError,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureUploadHostSyncReport {
    pub pending_request_count: usize,
    pub already_resident_count: usize,
    pub orphaned_resident_count: usize,
    pub uploaded_count: usize,
    pub released_orphaned_count: usize,
    pub invalid_request_count: usize,
    pub missing_asset_count: usize,
    pub host_error_count: usize,
    pub upload_error_count: usize,
    pub release_error_count: usize,
    pub uploaded_resource_ids: Vec<ResourceId>,
    pub released_orphaned_resource_ids: Vec<ResourceId>,
    pub failures: Vec<NativeTextureUploadHostSyncFailure>,
    pub release_failures: Vec<NativeTextureReleaseHostSyncFailure>,
}

impl NativeTextureUploadHostSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.failures.is_empty() && self.release_failures.is_empty()
    }

    pub(super) fn record_failure(&mut self, failure: NativeTextureUploadHostSyncFailure) {
        match failure.kind {
            NativeTextureUploadHostSyncFailureKind::InvalidRequest => {
                self.invalid_request_count += 1;
            }
            NativeTextureUploadHostSyncFailureKind::MissingAsset => {
                self.missing_asset_count += 1;
            }
            NativeTextureUploadHostSyncFailureKind::HostError => {
                self.host_error_count += 1;
            }
            NativeTextureUploadHostSyncFailureKind::UploadError => {
                self.upload_error_count += 1;
            }
        }
        self.failures.push(failure);
    }

    pub(super) fn record_release_failure(&mut self, failure: NativeTextureReleaseHostSyncFailure) {
        self.release_error_count += 1;
        self.release_failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeTextureUploadHostSyncFailure {
    pub kind: NativeTextureUploadHostSyncFailureKind,
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub bundle_name: Option<String>,
    pub package_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeTextureUploadHostSyncFailureKind {
    InvalidRequest,
    MissingAsset,
    HostError,
    UploadError,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeTextureReleaseHostSyncFailure {
    pub resource_id: ResourceId,
    pub message: String,
}

pub(super) fn failure(
    kind: NativeTextureUploadHostSyncFailureKind,
    request: &NativeTextureUploadRequest,
    bundle_name: Option<String>,
    package_id: Option<String>,
    message: String,
) -> NativeTextureUploadHostSyncFailure {
    NativeTextureUploadHostSyncFailure {
        kind,
        resource_id: request.resource_id.clone(),
        asset_type: request.asset_type.clone(),
        asset_name: request.asset_name.clone(),
        bundle_name,
        package_id,
        message,
    }
}
