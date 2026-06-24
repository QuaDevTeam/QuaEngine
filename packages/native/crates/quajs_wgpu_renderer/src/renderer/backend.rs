pub mod null;
pub mod submission;
#[cfg(feature = "wgpu-backend")]
pub mod wgpu;

pub use null::{NullNativeRenderBackend, NullNativeRenderBackendDiagnostics};
pub use submission::{
    NativeRenderBatchSubmission, NativeRenderFrameRef, NativeRenderMissingResource,
    NativeRenderPassSubmission, NativeRenderResourceMemoryBreakdown, NativeRenderSubmission,
};
#[cfg(feature = "wgpu-backend")]
pub use wgpu::{
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
};

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

pub trait NativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;
}
