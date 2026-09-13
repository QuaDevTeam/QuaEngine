use std::collections::BTreeSet;

use super::resources::NativeBackendDrawResourceBinding;
use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, DrawCommandParams, LogicalRect, RenderPlane,
};
use crate::renderer::backend::submission::NativeRenderCommandSubmission;
use crate::resources::{NativeResourceLedger, ResourceId};

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
    pub resource_bindings: Vec<NativeBackendDrawResourceBinding>,
    pub resource_state: NativeBackendDrawCommandResourceState,
    pub params: DrawCommandParams,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl NativeBackendDrawCommandPlan {
    pub(super) fn from_submission_command(
        sequence_index: usize,
        pass_index: usize,
        batch_index: usize,
        command_index: usize,
        pipeline: DrawBatchPipeline,
        submission: &NativeRenderCommandSubmission,
        resources: Option<&NativeResourceLedger>,
    ) -> Self {
        let command = &submission.command;
        let resource_bindings = resources
            .map(|resources| {
                command
                    .resource_ids
                    .iter()
                    .map(|resource_id| {
                        NativeBackendDrawResourceBinding::from_resource_id(
                            resource_id,
                            resources,
                            command.kind,
                            command.owner_package_id.as_ref(),
                            &command.required_package_ids,
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let (resolved_resource_ids, missing_resource_ids, blocking_missing_resource_ids) =
            match resources {
                Some(_) => resource_ids_from_bindings(&resource_bindings),
                None => (
                    submission.resolved_resource_ids.clone(),
                    submission.missing_resource_ids.clone(),
                    submission.missing_resource_ids.clone(),
                ),
            };
        let resource_state = if blocking_missing_resource_ids.is_empty() {
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
            resolved_resource_ids,
            missing_resource_ids,
            resource_bindings,
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

fn resource_ids_from_bindings(
    bindings: &[NativeBackendDrawResourceBinding],
) -> (Vec<ResourceId>, Vec<ResourceId>, Vec<ResourceId>) {
    let mut resolved = Vec::new();
    let mut missing = Vec::new();
    let mut blocking_missing = Vec::new();

    for binding in bindings {
        if binding.state.is_resolved() {
            resolved.push(binding.resource_id.clone());
        } else {
            missing.push(binding.resource_id.clone());
            if binding.blocks_draw() {
                blocking_missing.push(binding.resource_id.clone());
            }
        }
    }

    (resolved, missing, blocking_missing)
}
