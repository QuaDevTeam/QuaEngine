use crate::frame::PreparedNativeFrame;
use crate::render_graph::{
    DrawBatch, DrawBatchPipeline, DrawCommandKind, RenderPlane, RenderViewport,
};
use crate::resources::{NativeResourceLedger, ResourceId};

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
        let passes = self
            .frame
            .passes
            .passes
            .iter()
            .map(|pass| NativeRenderPassSubmission::from_pass(pass, self.resources))
            .collect::<Vec<_>>();

        NativeRenderSubmission {
            revision: self.revision,
            pass_count: self.frame.passes.passes.len(),
            batch_count: self.frame.passes.batch_count,
            command_count: self.frame.summary.command_count,
            resource_count: self.resources.len(),
            missing_resource_count: passes.iter().map(|pass| pass.missing_resource_count).sum(),
            passes,
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
    pub missing_resource_count: usize,
    pub passes: Vec<NativeRenderPassSubmission>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderPassSubmission {
    pub plane: RenderPlane,
    pub batch_count: usize,
    pub command_count: usize,
    pub resolved_resource_count: usize,
    pub missing_resource_count: usize,
    pub viewport: RenderViewport,
    pub batches: Vec<NativeRenderBatchSubmission>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderBatchSubmission {
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub resource_ids: Vec<ResourceId>,
    pub resolved_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub command_ids: Vec<String>,
}

impl NativeRenderPassSubmission {
    fn from_pass(pass: &crate::render_graph::RenderPass, resources: &NativeResourceLedger) -> Self {
        let batches = pass
            .batches
            .iter()
            .map(|batch| NativeRenderBatchSubmission::from_batch(batch, resources))
            .collect::<Vec<_>>();
        Self {
            plane: pass.plane,
            batch_count: pass.batches.len(),
            command_count: pass.command_count,
            viewport: pass.viewport,
            resolved_resource_count: batches
                .iter()
                .map(|batch| batch.resolved_resource_ids.len())
                .sum(),
            missing_resource_count: batches
                .iter()
                .map(|batch| batch.missing_resource_ids.len())
                .sum(),
            batches,
        }
    }
}

impl NativeRenderBatchSubmission {
    fn from_batch(batch: &DrawBatch, resources: &NativeResourceLedger) -> Self {
        let (resolved_resource_ids, missing_resource_ids) =
            partition_resource_ids(&batch.key.resource_ids, resources);
        Self {
            pipeline: batch.key.pipeline,
            kind: batch.key.kind,
            resource_ids: batch.key.resource_ids.clone(),
            resolved_resource_ids,
            missing_resource_ids,
            command_ids: batch.command_ids.clone(),
        }
    }
}

fn partition_resource_ids(
    resource_ids: &[ResourceId],
    resources: &NativeResourceLedger,
) -> (Vec<ResourceId>, Vec<ResourceId>) {
    resource_ids
        .iter()
        .cloned()
        .partition(|id| resources.get(id.clone()).is_some())
}

pub trait NativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;
}

#[cfg(test)]
mod tests;
