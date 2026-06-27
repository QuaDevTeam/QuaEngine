use std::collections::BTreeMap;

use crate::render_graph::{DrawBatch, DrawCommand, RenderGraph};
use crate::resources::{NativeResourceLedger, ResourceId};

use super::resources::partition_resource_ids;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderCommandSubmission {
    pub command: DrawCommand,
    pub resolved_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
}

pub(super) struct NativeRenderCommandSubmissionIndex<'a> {
    by_id: BTreeMap<&'a str, &'a DrawCommand>,
}

impl<'a> NativeRenderCommandSubmissionIndex<'a> {
    pub(super) fn from_graph(graph: &'a RenderGraph) -> Self {
        Self {
            by_id: graph
                .commands()
                .iter()
                .map(|command| (command.id.as_str(), command))
                .collect(),
        }
    }

    pub(super) fn command_submissions_for_batch(
        &self,
        batch: &DrawBatch,
        resources: &NativeResourceLedger,
    ) -> Vec<NativeRenderCommandSubmission> {
        batch
            .command_ids
            .iter()
            .filter_map(|command_id| self.by_id.get(command_id.as_str()).copied())
            .map(|command| NativeRenderCommandSubmission::from_command(command, resources))
            .collect()
    }
}

impl NativeRenderCommandSubmission {
    fn from_command(command: &DrawCommand, resources: &NativeResourceLedger) -> Self {
        let (resolved_resource_ids, missing_resource_ids) =
            partition_resource_ids(&command.resource_ids, resources);
        Self {
            command: command.clone(),
            resolved_resource_ids,
            missing_resource_ids,
        }
    }
}
