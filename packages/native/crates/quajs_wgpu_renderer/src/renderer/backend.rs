use std::collections::BTreeSet;

use crate::frame::PreparedNativeFrame;
use crate::render_graph::{
    DrawBatch, DrawBatchPipeline, DrawCommandKind, RenderPlane, RenderViewport,
};
use crate::resources::{NativeResourceLedger, ResourceId, ResourceMemory};

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

        let resolved_resource_memory = sum_resolved_resource_memory(
            passes
                .iter()
                .flat_map(|pass| pass.resolved_resource_ids().cloned()),
            self.resources,
        );

        NativeRenderSubmission {
            revision: self.revision,
            pass_count: self.frame.passes.passes.len(),
            batch_count: self.frame.passes.batch_count,
            command_count: self.frame.summary.command_count,
            resource_count: self.resources.len(),
            missing_resource_count: passes.iter().map(|pass| pass.missing_resource_count).sum(),
            resolved_resource_memory,
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
    pub resolved_resource_memory: ResourceMemory,
    pub passes: Vec<NativeRenderPassSubmission>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderPassSubmission {
    pub plane: RenderPlane,
    pub batch_count: usize,
    pub command_count: usize,
    pub resolved_resource_count: usize,
    pub missing_resource_count: usize,
    pub resolved_resource_memory: ResourceMemory,
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
    pub resolved_resource_memory: ResourceMemory,
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
            resolved_resource_memory: sum_resolved_resource_memory(
                batches
                    .iter()
                    .flat_map(|batch| batch.resolved_resource_ids.iter().cloned()),
                resources,
            ),
            batches,
        }
    }

    fn resolved_resource_ids(&self) -> impl Iterator<Item = &ResourceId> {
        self.batches
            .iter()
            .flat_map(|batch| batch.resolved_resource_ids.iter())
    }
}

impl NativeRenderBatchSubmission {
    fn from_batch(batch: &DrawBatch, resources: &NativeResourceLedger) -> Self {
        let (resolved_resource_ids, missing_resource_ids) =
            partition_resource_ids(&batch.key.resource_ids, resources);
        let resolved_resource_memory =
            sum_resolved_resource_memory(resolved_resource_ids.iter().cloned(), resources);
        Self {
            pipeline: batch.key.pipeline,
            kind: batch.key.kind,
            resource_ids: batch.key.resource_ids.clone(),
            resolved_resource_ids,
            missing_resource_ids,
            resolved_resource_memory,
            command_ids: batch.command_ids.clone(),
        }
    }
}

fn partition_resource_ids(
    resource_ids: &[ResourceId],
    resources: &NativeResourceLedger,
) -> (Vec<ResourceId>, Vec<ResourceId>) {
    let mut resolved_resource_ids = Vec::new();
    let mut missing_resource_ids = Vec::new();

    for id in resource_ids {
        if resources.get(id.clone()).is_some() {
            resolved_resource_ids.push(id.clone());
        } else {
            missing_resource_ids.push(id.clone());
        }
    }

    (resolved_resource_ids, missing_resource_ids)
}

fn sum_resolved_resource_memory<I>(
    resource_ids: I,
    resources: &NativeResourceLedger,
) -> ResourceMemory
where
    I: IntoIterator<Item = ResourceId>,
{
    let mut seen = BTreeSet::new();
    let mut memory = ResourceMemory::default();

    for id in resource_ids {
        if !seen.insert(id.clone()) {
            continue;
        }

        if let Some(record) = resources.get(id) {
            memory.add_assign(record.memory);
        }
    }

    memory
}

pub trait NativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;
}

#[cfg(test)]
mod tests;
