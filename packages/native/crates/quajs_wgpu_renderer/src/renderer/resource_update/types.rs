use std::collections::BTreeMap;

use crate::audio::AudioBackendCommandPlan;
use crate::resources::{
    AudioResourceSyncPlan, FrameResourceSyncPlan, NativeAssetRequestPlan, NativeResourceKind,
    NativeResourceRecord, NativeTextureUploadRequestPlan, PackageUnloadBlockerReason,
    PackageUnloadPlan, ResourceId, ResourceMemory,
};
use crate::video::VideoBackendCommandPlan;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameUpdate {
    pub revision: u64,
    pub resource_sync: FrameResourceSyncPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub resource_sync_summary: NativeRendererFrameResourceSyncSummary,
    pub texture_uploads: NativeTextureUploadRequestPlan,
    pub audio_resource_sync: AudioResourceSyncPlan,
    pub audio_resource_sync_summary: NativeRendererFrameAudioResourceSyncSummary,
    pub audio_assets: NativeAssetRequestPlan,
    pub audio_backend_commands: AudioBackendCommandPlan,
    pub video_backend_commands: VideoBackendCommandPlan,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameResourceSyncSummary {
    pub upsert_count: usize,
    pub retain_count: usize,
    pub release_count: usize,
    pub released_count: usize,
    pub replacement_release_count: usize,
    pub declarative_upsert_count: usize,
    pub declarative_released_count: usize,
    pub released_memory: ResourceMemory,
    pub declarative_released_memory: ResourceMemory,
    pub upsert_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameAudioResourceSyncSummary {
    pub upsert_count: usize,
    pub retain_count: usize,
    pub release_count: usize,
    pub released_count: usize,
    pub replacement_release_count: usize,
    pub released_memory: ResourceMemory,
    pub upsert_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererPackageRelease {
    pub revision: u64,
    pub plan: PackageUnloadPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub summary: NativeRendererPackageReleaseSummary,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererHostCleanupRecord {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub declarative_asset: bool,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub memory: ResourceMemory,
    pub label: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererPackageReleaseSummary {
    pub releasable_count: usize,
    pub blocked_count: usize,
    pub released_count: usize,
    pub declarative_released_count: usize,
    pub declarative_blocked_count: usize,
    pub released_memory: ResourceMemory,
    pub declarative_released_memory: ResourceMemory,
    pub blocked_memory: ResourceMemory,
    pub declarative_blocked_memory: ResourceMemory,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub blocked_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub blocked_by_reason: BTreeMap<PackageUnloadBlockerReason, usize>,
    pub blocked_memory_by_kind: BTreeMap<NativeResourceKind, ResourceMemory>,
    pub blocked_memory_by_reason: BTreeMap<PackageUnloadBlockerReason, ResourceMemory>,
}
