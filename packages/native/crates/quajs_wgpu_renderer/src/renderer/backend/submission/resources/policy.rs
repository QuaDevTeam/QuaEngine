use crate::renderer::NativeRenderBackendError;

use super::super::NativeRenderSubmission;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum NativeRenderBackendResourcePolicy {
    #[default]
    AllowMissingResources,
    RejectMissingResources,
}

impl NativeRenderBackendResourcePolicy {
    pub fn validate_submission(
        self,
        submission: &NativeRenderSubmission,
    ) -> Result<(), NativeRenderBackendError> {
        match self {
            Self::AllowMissingResources => Ok(()),
            Self::RejectMissingResources if submission.missing_resource_count == 0 => Ok(()),
            Self::RejectMissingResources => Err(NativeRenderBackendError::backend_rejected(
                missing_resource_rejection_message(submission),
            )),
        }
    }
}

fn missing_resource_rejection_message(submission: &NativeRenderSubmission) -> String {
    let resource_ids = submission
        .missing_resources
        .iter()
        .map(|missing| missing.resource_id.as_str())
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        "Native render submission {} has {} missing resource(s): {}.",
        submission.revision, submission.missing_resource_count, resource_ids
    )
}
