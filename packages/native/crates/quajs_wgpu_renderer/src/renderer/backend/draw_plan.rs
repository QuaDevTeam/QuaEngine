use std::collections::BTreeSet;

use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, DrawCommandParams, LogicalRect, RenderPlane, RenderViewport,
};
use crate::resources::ResourceId;

use super::submission::{
    NativeRenderBatchSubmission, NativeRenderCommandSubmission, NativeRenderPassSubmission,
    NativeRenderSubmission,
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendDrawPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub drawable_command_count: usize,
    pub blocked_command_count: usize,
    pub passes: Vec<NativeBackendPassDrawPlan>,
}

impl NativeBackendDrawPlan {
    pub fn from_submission(submission: &NativeRenderSubmission) -> Self {
        let mut next_sequence_index = 0;
        let passes = submission
            .passes
            .iter()
            .enumerate()
            .map(|(pass_index, pass)| {
                NativeBackendPassDrawPlan::from_submission_pass(
                    pass_index,
                    pass,
                    &mut next_sequence_index,
                )
            })
            .collect::<Vec<_>>();

        let drawable_command_count = passes.iter().map(|pass| pass.drawable_command_count).sum();
        let blocked_command_count = passes.iter().map(|pass| pass.blocked_command_count).sum();

        Self {
            revision: submission.revision,
            pass_count: submission.pass_count,
            batch_count: submission.batch_count,
            command_count: submission.command_count,
            drawable_command_count,
            blocked_command_count,
            passes,
        }
    }

    pub fn commands(&self) -> impl Iterator<Item = &NativeBackendDrawCommandPlan> {
        self.passes
            .iter()
            .flat_map(NativeBackendPassDrawPlan::commands)
    }

    pub fn drawable_commands(&self) -> impl Iterator<Item = &NativeBackendDrawCommandPlan> {
        self.commands()
            .filter(|command| command.resource_state.is_ready())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendPassDrawPlan {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: RenderViewport,
    pub batch_count: usize,
    pub command_count: usize,
    pub drawable_command_count: usize,
    pub blocked_command_count: usize,
    pub batches: Vec<NativeBackendBatchDrawPlan>,
}

impl NativeBackendPassDrawPlan {
    fn from_submission_pass(
        pass_index: usize,
        pass: &NativeRenderPassSubmission,
        next_sequence_index: &mut usize,
    ) -> Self {
        let batches = pass
            .batches
            .iter()
            .enumerate()
            .map(|(batch_index, batch)| {
                NativeBackendBatchDrawPlan::from_submission_batch(
                    pass_index,
                    batch_index,
                    batch,
                    next_sequence_index,
                )
            })
            .collect::<Vec<_>>();
        let drawable_command_count = batches
            .iter()
            .map(|batch| batch.drawable_command_count)
            .sum();
        let blocked_command_count = batches
            .iter()
            .map(|batch| batch.blocked_command_count)
            .sum();

        Self {
            pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            batch_count: pass.batch_count,
            command_count: pass.command_count,
            drawable_command_count,
            blocked_command_count,
            batches,
        }
    }

    pub fn commands(&self) -> impl Iterator<Item = &NativeBackendDrawCommandPlan> {
        self.batches
            .iter()
            .flat_map(NativeBackendBatchDrawPlan::commands)
    }
}

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
    fn from_submission_batch(
        pass_index: usize,
        batch_index: usize,
        batch: &NativeRenderBatchSubmission,
        next_sequence_index: &mut usize,
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

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendDrawCommandPlan {
    pub sequence_index: usize,
    pub pass_index: usize,
    pub batch_index: usize,
    pub command_index: usize,
    pub command_id: String,
    pub pipeline: DrawBatchPipeline,
    pub plane: RenderPlane,
    pub z_index: i32,
    pub kind: DrawCommandKind,
    pub bounds: LogicalRect,
    pub opacity: f32,
    pub clip_bounds: Vec<LogicalRect>,
    pub resource_ids: Vec<ResourceId>,
    pub resolved_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub resource_state: NativeBackendDrawCommandResourceState,
    pub params: DrawCommandParams,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl NativeBackendDrawCommandPlan {
    fn from_submission_command(
        sequence_index: usize,
        pass_index: usize,
        batch_index: usize,
        command_index: usize,
        pipeline: DrawBatchPipeline,
        submission: &NativeRenderCommandSubmission,
    ) -> Self {
        let command = &submission.command;
        let resource_state = if submission.missing_resource_ids.is_empty() {
            NativeBackendDrawCommandResourceState::Ready
        } else {
            NativeBackendDrawCommandResourceState::MissingResources
        };

        Self {
            sequence_index,
            pass_index,
            batch_index,
            command_index,
            command_id: command.id.clone(),
            pipeline,
            plane: command.plane,
            z_index: command.z_index,
            kind: command.kind,
            bounds: command.bounds,
            opacity: command.opacity,
            clip_bounds: command.clip_bounds.clone(),
            resource_ids: command.resource_ids.clone(),
            resolved_resource_ids: submission.resolved_resource_ids.clone(),
            missing_resource_ids: submission.missing_resource_ids.clone(),
            resource_state,
            params: command.params.clone(),
            owner_package_id: command.owner_package_id.clone(),
            required_package_ids: command.required_package_ids.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeBackendDrawCommandResourceState {
    Ready,
    MissingResources,
}

impl NativeBackendDrawCommandResourceState {
    pub fn is_ready(self) -> bool {
        self == Self::Ready
    }
}

#[cfg(test)]
mod tests;
