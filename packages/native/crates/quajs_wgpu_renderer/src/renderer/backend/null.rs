use super::submission::NativeRenderFallbackWarningTracker;
use super::{
    NativeRenderBackend, NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderBackendResult, NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef,
    NativeRenderSubmission,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackend {
    submissions: Vec<NativeRenderSubmission>,
    resource_policy: NativeRenderBackendResourcePolicy,
    fallback_warnings: NativeRenderFallbackWarningTracker,
}

impl NullNativeRenderBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_resource_policy(resource_policy: NativeRenderBackendResourcePolicy) -> Self {
        Self {
            submissions: Vec::new(),
            resource_policy,
            fallback_warnings: NativeRenderFallbackWarningTracker::default(),
        }
    }

    pub fn resource_policy(&self) -> NativeRenderBackendResourcePolicy {
        self.resource_policy
    }

    pub fn submissions(&self) -> &[NativeRenderSubmission] {
        &self.submissions
    }

    pub fn last_submission(&self) -> Option<&NativeRenderSubmission> {
        self.submissions.last()
    }

    pub fn diagnostics(&self) -> NullNativeRenderBackendDiagnostics {
        NullNativeRenderBackendDiagnostics {
            submitted_frames: self.submissions.len(),
            resources: NativeRenderBackendResourceDiagnostics::from_submissions(&self.submissions),
            fallback_warnings: self.fallback_warnings.diagnostics(),
            last_submission: self.last_submission().cloned(),
        }
    }
}

impl NativeRenderBackend for NullNativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.resource_policy.validate_submission(&submission)?;
        self.fallback_warnings
            .record_submission(&submission.fallback_diagnostics);
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackendDiagnostics {
    pub submitted_frames: usize,
    pub resources: NativeRenderBackendResourceDiagnostics,
    pub fallback_warnings: NativeRenderFallbackWarningDiagnostics,
    pub last_submission: Option<NativeRenderSubmission>,
}

#[cfg(test)]
mod tests;
