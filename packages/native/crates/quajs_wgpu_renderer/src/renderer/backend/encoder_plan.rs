use std::collections::BTreeSet;

use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, DrawCommandParams, LogicalRect, RenderPlane, RenderViewport,
};
use crate::resources::ResourceId;

use super::draw_plan::{
    NativeBackendDrawCommandPlan, NativeBackendDrawCommandResourceState, NativeBackendDrawPlan,
    NativeBackendDrawResourceBinding,
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendEncoderPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub step_count: usize,
    pub draw_step_count: usize,
    pub skipped_draw_step_count: usize,
    pub passes: Vec<NativeBackendEncoderPassPlan>,
}

impl NativeBackendEncoderPlan {
    pub fn from_draw_plan(draw_plan: &NativeBackendDrawPlan) -> Self {
        let passes = draw_plan
            .passes
            .iter()
            .map(NativeBackendEncoderPassPlan::from_draw_pass)
            .collect::<Vec<_>>();
        let step_count = passes.iter().map(|pass| pass.steps.len()).sum();
        let draw_step_count = passes.iter().map(|pass| pass.draw_step_count).sum();
        let skipped_draw_step_count = passes.iter().map(|pass| pass.skipped_draw_step_count).sum();

        Self {
            revision: draw_plan.revision,
            pass_count: draw_plan.pass_count,
            step_count,
            draw_step_count,
            skipped_draw_step_count,
            passes,
        }
    }

    pub fn steps(&self) -> impl Iterator<Item = &NativeBackendEncoderStep> {
        self.passes
            .iter()
            .flat_map(NativeBackendEncoderPassPlan::steps)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeBackendDrawCommandMetadata {
    pub bounds: LogicalRect,
    pub opacity: f32,
    pub params: DrawCommandParams,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl NativeBackendDrawCommandMetadata {
    fn from_command(command: &NativeBackendDrawCommandPlan) -> Self {
        Self {
            bounds: command.bounds,
            opacity: command.opacity,
            params: command.params.clone(),
            owner_package_id: command.owner_package_id.clone(),
            required_package_ids: command.required_package_ids.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendEncoderPassPlan {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: RenderViewport,
    pub step_count: usize,
    pub draw_step_count: usize,
    pub skipped_draw_step_count: usize,
    pub steps: Vec<NativeBackendEncoderStep>,
}

impl NativeBackendEncoderPassPlan {
    fn from_draw_pass(pass: &super::draw_plan::NativeBackendPassDrawPlan) -> Self {
        let mut steps = Vec::new();
        steps.push(NativeBackendEncoderStep::BeginPass {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
        });

        let mut active_pipeline = None;
        let mut active_clip_stack = Vec::<LogicalRect>::new();
        for command in pass.commands() {
            if active_pipeline != Some(command.pipeline) {
                active_pipeline = Some(command.pipeline);
                steps.push(NativeBackendEncoderStep::BindPipeline {
                    pipeline: command.pipeline,
                });
            }

            synchronize_clip_stack(&mut steps, &mut active_clip_stack, &command.clip_bounds);

            match command.resource_state {
                NativeBackendDrawCommandResourceState::Ready => {
                    steps.push(NativeBackendEncoderStep::DrawCommand {
                        command_id: command.command_id.clone(),
                        pipeline: command.pipeline,
                        kind: command.kind,
                        metadata: NativeBackendDrawCommandMetadata::from_command(command),
                        resource_ids: command.resource_ids.clone(),
                        resource_bindings: command.resource_bindings.clone(),
                        clip_depth: active_clip_stack.len(),
                    });
                }
                NativeBackendDrawCommandResourceState::MissingResources => {
                    steps.push(NativeBackendEncoderStep::SkipCommand {
                        command_id: command.command_id.clone(),
                        pipeline: command.pipeline,
                        kind: command.kind,
                        metadata: NativeBackendDrawCommandMetadata::from_command(command),
                        reason: NativeBackendEncoderSkipReason::MissingResources,
                        missing_resource_ids: command.missing_resource_ids.clone(),
                        resource_bindings: command.resource_bindings.clone(),
                    });
                }
            }
        }

        pop_clip_stack(&mut steps, &mut active_clip_stack, 0);
        steps.push(NativeBackendEncoderStep::EndPass {
            pass_index: pass.pass_index,
            plane: pass.plane,
        });

        let draw_step_count = steps
            .iter()
            .filter(|step| matches!(step, NativeBackendEncoderStep::DrawCommand { .. }))
            .count();
        let skipped_draw_step_count = steps
            .iter()
            .filter(|step| matches!(step, NativeBackendEncoderStep::SkipCommand { .. }))
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            step_count: steps.len(),
            draw_step_count,
            skipped_draw_step_count,
            steps,
        }
    }

    pub fn steps(&self) -> impl Iterator<Item = &NativeBackendEncoderStep> {
        self.steps.iter()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeBackendEncoderStep {
    BeginPass {
        pass_index: usize,
        plane: RenderPlane,
        viewport: RenderViewport,
    },
    EndPass {
        pass_index: usize,
        plane: RenderPlane,
    },
    BindPipeline {
        pipeline: DrawBatchPipeline,
    },
    PushClip {
        bounds: LogicalRect,
        depth: usize,
    },
    PopClip {
        depth: usize,
    },
    DrawCommand {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: NativeBackendDrawCommandMetadata,
        resource_ids: Vec<ResourceId>,
        resource_bindings: Vec<NativeBackendDrawResourceBinding>,
        clip_depth: usize,
    },
    SkipCommand {
        command_id: String,
        pipeline: DrawBatchPipeline,
        kind: DrawCommandKind,
        metadata: NativeBackendDrawCommandMetadata,
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
        resource_bindings: Vec<NativeBackendDrawResourceBinding>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum NativeBackendEncoderSkipReason {
    MissingResources,
}

fn synchronize_clip_stack(
    steps: &mut Vec<NativeBackendEncoderStep>,
    active_clip_stack: &mut Vec<LogicalRect>,
    next_clip_stack: &[LogicalRect],
) {
    let common_prefix_len = common_clip_prefix_len(active_clip_stack, next_clip_stack);
    pop_clip_stack(steps, active_clip_stack, common_prefix_len);
    for bounds in &next_clip_stack[common_prefix_len..] {
        active_clip_stack.push(*bounds);
        steps.push(NativeBackendEncoderStep::PushClip {
            bounds: *bounds,
            depth: active_clip_stack.len(),
        });
    }
}

fn pop_clip_stack(
    steps: &mut Vec<NativeBackendEncoderStep>,
    active_clip_stack: &mut Vec<LogicalRect>,
    target_depth: usize,
) {
    while active_clip_stack.len() > target_depth {
        let depth = active_clip_stack.len();
        active_clip_stack.pop();
        steps.push(NativeBackendEncoderStep::PopClip { depth });
    }
}

fn common_clip_prefix_len(left: &[LogicalRect], right: &[LogicalRect]) -> usize {
    left.iter()
        .zip(right.iter())
        .take_while(|(left, right)| left == right)
        .count()
}

#[cfg(test)]
mod tests;
