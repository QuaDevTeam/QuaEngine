use super::batch::NativeBackendBatchDrawPlan;
use super::command::NativeBackendDrawCommandPlan;
use crate::render_graph::{RenderPlane, RenderViewport};
use crate::renderer::backend::submission::NativeRenderPassSubmission;
use crate::resources::NativeResourceLedger;

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
    pub(super) fn from_submission_pass(
        pass_index: usize,
        pass: &NativeRenderPassSubmission,
        next_sequence_index: &mut usize,
        resources: Option<&NativeResourceLedger>,
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
                    resources,
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
