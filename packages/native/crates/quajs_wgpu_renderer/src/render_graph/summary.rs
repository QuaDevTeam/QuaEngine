use std::collections::{BTreeMap, BTreeSet};

use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderPlaneSummary {
    pub command_count: usize,
    pub interactive_count: usize,
    pub resource_ref_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderGraphResourceSummary {
    pub referenced_resource_ids: BTreeSet<ResourceId>,
    pub by_kind: BTreeMap<NativeResourceKind, usize>,
    pub estimated_memory: ResourceMemory,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderGraphPackageSummary {
    pub command_count: usize,
    pub resource_ref_count: usize,
    pub interactive_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderGraphSummary {
    pub command_count: usize,
    pub interactive_count: usize,
    pub by_plane: BTreeMap<super::command::RenderPlane, RenderPlaneSummary>,
    pub by_package: BTreeMap<String, RenderGraphPackageSummary>,
    pub resources: RenderGraphResourceSummary,
}

pub(crate) fn add_package_command(
    summary: &mut RenderGraphPackageSummary,
    command: &super::command::DrawCommand,
) {
    summary.command_count += 1;
    summary.resource_ref_count += command.resource_ids.len();
    if command.interactive {
        summary.interactive_count += 1;
    }
}
