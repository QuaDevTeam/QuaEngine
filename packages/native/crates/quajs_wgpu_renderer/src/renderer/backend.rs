use crate::frame::PreparedNativeFrame;
use crate::render_graph::{RenderPlane, RenderViewport};
use crate::resources::NativeResourceLedger;

pub mod null;
#[cfg(feature = "wgpu-backend")]
pub mod wgpu;

pub use null::{NullNativeRenderBackend, NullNativeRenderBackendDiagnostics};
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
            passes: self
                .frame
                .passes
                .passes
                .iter()
                .map(NativeRenderPassSubmission::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderSubmission {
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub resource_count: usize,
    pub passes: Vec<NativeRenderPassSubmission>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderPassSubmission {
    pub plane: RenderPlane,
    pub batch_count: usize,
    pub command_count: usize,
    pub viewport: RenderViewport,
}

impl From<&crate::render_graph::RenderPass> for NativeRenderPassSubmission {
    fn from(pass: &crate::render_graph::RenderPass) -> Self {
        Self {
            plane: pass.plane,
            batch_count: pass.batches.len(),
            command_count: pass.command_count,
            viewport: pass.viewport,
        }
    }
}

pub trait NativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;
}

#[cfg(test)]
mod tests;
