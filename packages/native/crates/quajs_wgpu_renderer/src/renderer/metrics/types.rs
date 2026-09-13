use std::collections::BTreeMap;

use crate::render_graph::{
    DrawBatchPipeline, RenderGraphPackageSummary, RenderPlane, RenderPlaneSummary,
};
use crate::resources::{
    NativeResourceKind, PackageResourceSummary, ResourceKindSummary, ResourceMemory,
    ResourceMemoryPressureSummary,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererMetrics {
    pub revision: u64,
    pub has_frame: bool,
    pub frame: NativeRendererFrameMetrics,
    pub resources: NativeRendererResourceMetrics,
    pub audio_backend: NativeRendererAudioBackendMetrics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameMetrics {
    pub command_count: usize,
    pub interactive_count: usize,
    pub pass_count: usize,
    pub batch_count: usize,
    pub resource_request_count: usize,
    pub resource_ref_count: usize,
    pub asset_request_count: usize,
    pub declarative_asset_request_count: usize,
    pub skipped_asset_resource_count: usize,
    pub fallback_count: usize,
    pub video_fallback_count: usize,
    pub by_plane: BTreeMap<RenderPlane, RenderPlaneSummary>,
    pub by_package: BTreeMap<String, RenderGraphPackageSummary>,
    pub by_resource_kind: BTreeMap<NativeResourceKind, usize>,
    pub asset_requests_by_type: BTreeMap<String, NativeRendererFrameAssetMetrics>,
    pub asset_requests_by_package: BTreeMap<String, NativeRendererFrameAssetMetrics>,
    pub fallbacks_by_pipeline: BTreeMap<DrawBatchPipeline, usize>,
    pub fallbacks_by_reason: BTreeMap<String, usize>,
    pub fallbacks_by_owner_package: BTreeMap<String, usize>,
    pub fallbacks_by_required_package: BTreeMap<String, usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameAssetMetrics {
    pub request_count: usize,
    pub command_ref_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererResourceMetrics {
    pub ledger_resource_count: usize,
    pub declarative_resource_count: usize,
    pub memory: ResourceMemory,
    pub declarative_memory: ResourceMemory,
    pub declarative_package_count: usize,
    pub audio: NativeRendererAudioResourceMetrics,
    pub pressure: ResourceMemoryPressureSummary,
    pub package_count: usize,
    pub kind_count: usize,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceKindSummary>,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
    pub declarative_by_package: BTreeMap<String, PackageResourceSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererAudioResourceMetrics {
    pub resource_count: usize,
    pub buffer_count: usize,
    pub stream_count: usize,
    pub handle_count: usize,
    pub memory: ResourceMemory,
    pub package_count: usize,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererAudioBackendMetrics {
    pub active_track_count: usize,
    pub active_track_count_by_package: BTreeMap<String, usize>,
}
