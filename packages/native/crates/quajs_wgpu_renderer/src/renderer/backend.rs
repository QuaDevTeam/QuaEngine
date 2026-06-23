use crate::frame::PreparedNativeFrame;
use crate::resources::NativeResourceLedger;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeRenderBackendErrorKind {
    NoPreparedFrame,
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderBackendError {
    pub kind: NativeRenderBackendErrorKind,
    pub message: String,
}

impl NativeRenderBackendError {
    pub fn no_prepared_frame() -> Self {
        Self {
            kind: NativeRenderBackendErrorKind::NoPreparedFrame,
            message: "Native renderer has no prepared frame to submit.".to_string(),
        }
    }

    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeRenderBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

pub type NativeRenderBackendResult = Result<NativeRenderSubmission, NativeRenderBackendError>;

#[derive(Clone, Copy, Debug)]
pub struct NativeRenderFrameRef<'a> {
    pub revision: u64,
    pub frame: &'a PreparedNativeFrame,
    pub resources: &'a NativeResourceLedger,
}

impl NativeRenderFrameRef<'_> {
    pub fn submission(&self) -> NativeRenderSubmission {
        NativeRenderSubmission {
            revision: self.revision,
            pass_count: self.frame.passes.passes.len(),
            batch_count: self.frame.passes.batch_count,
            command_count: self.frame.summary.command_count,
            resource_count: self.resources.len(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderSubmission {
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub resource_count: usize,
}

pub trait NativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;
}

#[cfg(test)]
mod tests;
