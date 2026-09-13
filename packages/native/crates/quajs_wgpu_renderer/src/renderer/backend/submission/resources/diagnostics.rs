use std::collections::BTreeMap;

use crate::resources::NativeResourceKind;

use super::super::NativeRenderSubmission;
use super::NativeRenderMissingResource;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderBackendResourceDiagnostics {
    pub frames_with_missing_resources: usize,
    pub missing_resource_count: usize,
    pub last_missing_resources: Vec<NativeRenderMissingResource>,
    pub missing_resources_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub missing_resources_by_owner_package: BTreeMap<String, usize>,
    pub missing_resources_by_required_package: BTreeMap<String, usize>,
}

impl NativeRenderBackendResourceDiagnostics {
    pub fn from_submissions(submissions: &[NativeRenderSubmission]) -> Self {
        let mut diagnostics = Self::default();
        for submission in submissions {
            diagnostics.record_submission(submission);
        }
        diagnostics
    }

    pub(crate) fn record_submission(&mut self, submission: &NativeRenderSubmission) {
        if submission.missing_resource_count > 0 {
            self.frames_with_missing_resources = self.frames_with_missing_resources.saturating_add(1);
            self.last_missing_resources = submission.missing_resources.clone();
        }
        self.missing_resource_count = self.missing_resource_count.saturating_add(submission.missing_resource_count);
        for missing in &submission.missing_resources {
            let count = self.missing_resources_by_kind.entry(missing.resource_kind()).or_default();
            *count = count.saturating_add(1);
            for package_id in &missing.owner_package_ids {
                let count = self.missing_resources_by_owner_package.entry(package_id.clone()).or_default();
                *count = count.saturating_add(1);
            }
            for package_id in &missing.required_package_ids {
                let count = self.missing_resources_by_required_package.entry(package_id.clone()).or_default();
                *count = count.saturating_add(1);
            }
        }
    }
}
