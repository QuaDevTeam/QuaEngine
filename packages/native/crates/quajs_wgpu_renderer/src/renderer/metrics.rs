use std::collections::BTreeMap;

use crate::frame::PreparedNativeFrame;
use crate::render_graph::{RenderGraphPackageSummary, RenderPlane, RenderPlaneSummary};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, PackageResourceSummary, ResourceKindSummary,
    ResourceMemory,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererMetrics {
    pub revision: u64,
    pub has_frame: bool,
    pub frame: NativeRendererFrameMetrics,
    pub resources: NativeRendererResourceMetrics,
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
    pub skipped_asset_resource_count: usize,
    pub by_plane: BTreeMap<RenderPlane, RenderPlaneSummary>,
    pub by_package: BTreeMap<String, RenderGraphPackageSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererResourceMetrics {
    pub ledger_resource_count: usize,
    pub memory: ResourceMemory,
    pub package_count: usize,
    pub kind_count: usize,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceKindSummary>,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
}

impl NativeRendererMetrics {
    pub fn from_state(
        revision: u64,
        frame: Option<&PreparedNativeFrame>,
        resources: &NativeResourceLedger,
    ) -> Self {
        Self {
            revision,
            has_frame: frame.is_some(),
            frame: frame.map(frame_metrics).unwrap_or_default(),
            resources: resource_metrics(resources),
        }
    }
}

fn frame_metrics(frame: &PreparedNativeFrame) -> NativeRendererFrameMetrics {
    NativeRendererFrameMetrics {
        command_count: frame.summary.command_count,
        interactive_count: frame.summary.interactive_count,
        pass_count: frame.passes.passes.len(),
        batch_count: frame.passes.batch_count,
        resource_request_count: frame.resources.requests.len(),
        resource_ref_count: frame.resources.resource_ref_count,
        asset_request_count: frame.assets.requests.len(),
        skipped_asset_resource_count: frame.assets.skipped_resource_ids.len(),
        by_plane: frame.summary.by_plane.clone(),
        by_package: frame.summary.by_package.clone(),
    }
}

fn resource_metrics(resources: &NativeResourceLedger) -> NativeRendererResourceMetrics {
    let summary = resources.summary();

    NativeRendererResourceMetrics {
        ledger_resource_count: summary.total_count,
        memory: summary.total_memory,
        package_count: summary.by_package.len(),
        kind_count: summary.by_kind.len(),
        by_kind: summary.by_kind,
        by_package: summary.by_package,
    }
}

#[cfg(test)]
mod tests;
