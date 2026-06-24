use super::{
    NativeRenderBackend, NativeRenderBackendResourceDiagnostics, NativeRenderBackendResult,
    NativeRenderFrameRef, NativeRenderSubmission,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackend {
    submissions: Vec<NativeRenderSubmission>,
}

impl NullNativeRenderBackend {
    pub fn new() -> Self {
        Self::default()
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
            last_submission: self.last_submission().cloned(),
        }
    }
}

impl NativeRenderBackend for NullNativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackendDiagnostics {
    pub submitted_frames: usize,
    pub resources: NativeRenderBackendResourceDiagnostics,
    pub last_submission: Option<NativeRenderSubmission>,
}

#[cfg(test)]
mod tests;
