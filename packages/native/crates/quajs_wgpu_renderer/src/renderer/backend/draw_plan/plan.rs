use super::command::NativeBackendDrawCommandPlan;
use super::pass::NativeBackendPassDrawPlan;
use crate::renderer::backend::submission::NativeRenderSubmission;
use crate::resources::NativeResourceLedger;

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
        Self::from_submission_with_resources(submission, None)
    }

    pub fn from_submission_and_resources(
        submission: &NativeRenderSubmission,
        resources: &NativeResourceLedger,
    ) -> Self {
        Self::from_submission_with_resources(submission, Some(resources))
    }

    fn from_submission_with_resources(
        submission: &NativeRenderSubmission,
        resources: Option<&NativeResourceLedger>,
    ) -> Self {
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
                    resources,
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
