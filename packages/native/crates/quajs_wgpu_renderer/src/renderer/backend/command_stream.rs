use std::collections::BTreeSet;

mod validation;

use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, LogicalRect, RenderPlane, RenderViewport,
};
use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

use super::encoder_plan::{
    NativeBackendDrawCommandMetadata, NativeBackendEncoderPlan, NativeBackendEncoderSkipReason,
    NativeBackendEncoderStep,
};

pub use validation::{
    NativeBackendCommandStreamValidationError, NativeBackendCommandStreamValidationErrorKind,
    NativeBackendCommandStreamValidationReport,
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendCommandStreamPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub command_count: usize,
    pub draw_command_count: usize,
    pub skipped_draw_command_count: usize,
    pub passes: Vec<NativeBackendCommandStreamPass>,
}

impl NativeBackendCommandStreamPlan {
    pub fn from_encoder_plan(encoder_plan: &NativeBackendEncoderPlan) -> Self {
        let passes = encoder_plan
            .passes
            .iter()
            .map(NativeBackendCommandStreamPass::from_encoder_pass)
            .collect::<Vec<_>>();
        let command_count = passes.iter().map(|pass| pass.commands.len()).sum();
        let draw_command_count = passes.iter().map(|pass| pass.draw_command_count).sum();
        let skipped_draw_command_count = passes
            .iter()
            .map(|pass| pass.skipped_draw_command_count)
            .sum();

        Self {
            revision: encoder_plan.revision,
            pass_count: encoder_plan.pass_count,
            command_count,
            draw_command_count,
            skipped_draw_command_count,
            passes,
        }
    }

    pub fn commands(&self) -> impl Iterator<Item = &NativeBackendCommandStreamCommand> {
        self.passes
            .iter()
            .flat_map(NativeBackendCommandStreamPass::commands)
    }

    pub fn validate(&self) -> NativeBackendCommandStreamValidationReport {
        NativeBackendCommandStreamValidationReport::validate(self)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendCommandStreamPass {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: RenderViewport,
    pub command_count: usize,
    pub draw_command_count: usize,
    pub skipped_draw_command_count: usize,
    pub commands: Vec<NativeBackendCommandStreamCommand>,
}

impl NativeBackendCommandStreamPass {
    fn from_encoder_pass(pass: &super::encoder_plan::NativeBackendEncoderPassPlan) -> Self {
        let commands = pass
            .steps
            .iter()
            .flat_map(NativeBackendCommandStreamCommand::from_encoder_step)
            .collect::<Vec<_>>();
        let draw_command_count = commands
            .iter()
            .filter(|command| matches!(command, NativeBackendCommandStreamCommand::Draw { .. }))
            .count();
        let skipped_draw_command_count = commands
            .iter()
            .filter(|command| matches!(command, NativeBackendCommandStreamCommand::SkipDraw { .. }))
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            command_count: commands.len(),
            draw_command_count,
            skipped_draw_command_count,
            commands,
        }
    }

    pub fn commands(&self) -> impl Iterator<Item = &NativeBackendCommandStreamCommand> {
        self.commands.iter()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeBackendCommandStreamCommand {
    SetPipeline {
        pipeline: DrawBatchPipeline,
    },
    SetClip {
        rect: LogicalRect,
        depth: usize,
    },
    ClearClip {
        depth: usize,
    },
    BindResources {
        command_id: String,
        pipeline: DrawBatchPipeline,
        resources: Vec<NativeBackendCommandStreamResource>,
    },
    Draw {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: NativeBackendDrawCommandMetadata,
        clip_depth: usize,
        resource_count: usize,
    },
    SkipDraw {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: NativeBackendDrawCommandMetadata,
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
    },
}

impl NativeBackendCommandStreamCommand {
    fn from_encoder_step(step: &NativeBackendEncoderStep) -> Vec<Self> {
        match step {
            NativeBackendEncoderStep::BeginPass { .. }
            | NativeBackendEncoderStep::EndPass { .. } => Vec::new(),
            NativeBackendEncoderStep::BindPipeline { pipeline } => {
                vec![Self::SetPipeline {
                    pipeline: *pipeline,
                }]
            }
            NativeBackendEncoderStep::PushClip { bounds, depth } => vec![Self::SetClip {
                rect: *bounds,
                depth: *depth,
            }],
            NativeBackendEncoderStep::PopClip { depth } => {
                vec![Self::ClearClip { depth: *depth }]
            }
            NativeBackendEncoderStep::DrawCommand {
                command_id,
                pipeline,
                kind,
                metadata,
                resource_bindings,
                clip_depth,
                ..
            } => {
                let resources =
                    NativeBackendCommandStreamResource::resolved_from_bindings(resource_bindings);
                let resource_count = resources.len();
                let mut commands = Vec::new();
                if !resources.is_empty() {
                    commands.push(Self::BindResources {
                        command_id: command_id.clone(),
                        pipeline: *pipeline,
                        resources,
                    });
                }
                commands.push(Self::Draw {
                    command_id: command_id.clone(),
                    pipeline: *pipeline,
                    kind: *kind,
                    metadata: metadata.clone(),
                    clip_depth: *clip_depth,
                    resource_count,
                });
                commands
            }
            NativeBackendEncoderStep::SkipCommand {
                command_id,
                pipeline,
                kind,
                metadata,
                reason,
                missing_resource_ids,
                ..
            } => vec![Self::SkipDraw {
                command_id: command_id.clone(),
                pipeline: *pipeline,
                kind: *kind,
                metadata: metadata.clone(),
                reason: *reason,
                missing_resource_ids: missing_resource_ids.clone(),
            }],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeBackendCommandStreamResource {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub memory: ResourceMemory,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub label: Option<String>,
}

impl NativeBackendCommandStreamResource {
    fn resolved_from_bindings(
        bindings: &[super::draw_plan::NativeBackendDrawResourceBinding],
    ) -> Vec<Self> {
        bindings
            .iter()
            .filter_map(|binding| {
                let kind = binding.kind?;
                binding.state.is_resolved().then(|| Self {
                    resource_id: binding.resource_id.clone(),
                    kind,
                    memory: binding.memory,
                    owner_package_id: binding.owner_package_id.clone(),
                    required_package_ids: binding.required_package_ids.clone(),
                    label: binding.label.clone(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests;
