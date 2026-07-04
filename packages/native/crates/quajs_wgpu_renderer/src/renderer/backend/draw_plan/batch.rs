use super::command::NativeBackendDrawCommandPlan;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};
use crate::renderer::backend::submission::NativeRenderBatchSubmission;
use crate::resources::{NativeResourceLedger, ResourceId};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendBatchDrawPlan {
    pub pass_index: usize,
    pub batch_index: usize,
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub command_count: usize,
    pub drawable_command_count: usize,
    pub blocked_command_count: usize,
    pub resource_ids: Vec<ResourceId>,
    pub resolved_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub commands: Vec<NativeBackendDrawCommandPlan>,
}

impl NativeBackendBatchDrawPlan {
    pub(super) fn from_submission_batch(
        pass_index: usize,
        batch_index: usize,
        batch: &NativeRenderBatchSubmission,
        next_sequence_index: &mut usize,
        resources: Option<&NativeResourceLedger>,
    ) -> Self {
        let commands = batch
            .commands
            .iter()
            .enumerate()
            .map(|(command_index, command)| {
                let sequence_index = *next_sequence_index;
                *next_sequence_index = next_sequence_index.saturating_add(1);
                NativeBackendDrawCommandPlan::from_submission_command(
                    sequence_index,
                    pass_index,
                    batch_index,
                    command_index,
                    batch.pipeline,
                    command,
                    resources,
                )
            })
            .collect::<Vec<_>>();
        let drawable_command_count = commands
            .iter()
            .filter(|command| command.resource_state.is_ready())
            .count();
        let blocked_command_count = commands.len().saturating_sub(drawable_command_count);

        Self {
            pass_index,
            batch_index,
            pipeline: batch.pipeline,
            kind: batch.kind,
            command_count: batch.command_count,
            drawable_command_count,
            blocked_command_count,
            resource_ids: batch.resource_ids.clone(),
            resolved_resource_ids: batch.resolved_resource_ids.clone(),
            missing_resource_ids: batch.missing_resource_ids.clone(),
            commands,
        }
    }

    pub fn commands(&self) -> impl Iterator<Item = &NativeBackendDrawCommandPlan> {
        self.commands.iter()
    }
}
