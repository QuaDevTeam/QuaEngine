use crate::frame::PreparedNativeFrame;
use crate::render_graph::{
    DrawBatch, DrawBatchPipeline, DrawCommandKind, RenderPlane, RenderViewport,
};
use crate::resources::{NativeResourceLedger, ResourceId};

mod fallbacks;
mod resources;

pub use fallbacks::{
    NativeRenderFallbackDiagnostic, NativeRenderFallbackSummary,
    NativeRenderFallbackWarningDiagnostics,
};
pub use resources::{
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderMissingResource, NativeRenderResourceMemoryBreakdown,
};

pub(crate) use fallbacks::NativeRenderFallbackWarningTracker;

use fallbacks::{collect_fallback_diagnostics, summarize_fallback_diagnostics};
use resources::{collect_missing_resources, partition_resource_ids, summarize_resolved_resources};

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

        let resolved_resource_memory = summarize_resolved_resources(
            passes
                .iter()
                .flat_map(|pass| pass.resolved_resource_ids().cloned()),
            self.resources,
        );
        let missing_resources = collect_missing_resources(&passes);
        let fallback_diagnostics = collect_fallback_diagnostics(&self.frame.graph);
        let fallback_summary = summarize_fallback_diagnostics(&fallback_diagnostics);

        NativeRenderSubmission {
            revision: self.revision,
            pass_count: self.frame.passes.passes.len(),
            batch_count: self.frame.passes.batch_count,
            command_count: self.frame.summary.command_count,
            resource_count: self.resources.len(),
            missing_resource_count: missing_resources.len(),
            missing_resources,
            fallback_summary,
            fallback_diagnostics,
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
    pub missing_resources: Vec<NativeRenderMissingResource>,
    pub fallback_summary: NativeRenderFallbackSummary,
    pub fallback_diagnostics: Vec<NativeRenderFallbackDiagnostic>,
    pub resolved_resource_memory: NativeRenderResourceMemoryBreakdown,
    pub passes: Vec<NativeRenderPassSubmission>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRenderPassSubmission {
    pub plane: RenderPlane,
    pub batch_count: usize,
    pub command_count: usize,
    pub resolved_resource_count: usize,
    pub missing_resource_count: usize,
    pub resolved_resource_memory: NativeRenderResourceMemoryBreakdown,
    pub viewport: RenderViewport,
    pub batches: Vec<NativeRenderBatchSubmission>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderBatchSubmission {
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub command_count: usize,
    pub first_command_id: Option<String>,
    pub last_command_id: Option<String>,
    pub resource_ids: Vec<ResourceId>,
    pub resolved_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub resolved_resource_memory: NativeRenderResourceMemoryBreakdown,
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
            resolved_resource_memory: summarize_resolved_resources(
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
            summarize_resolved_resources(resolved_resource_ids.iter().cloned(), resources);
        Self {
            pipeline: batch.key.pipeline,
            kind: batch.key.kind,
            command_count: batch.command_count(),
            first_command_id: batch.command_ids.first().cloned(),
            last_command_id: batch.command_ids.last().cloned(),
            resource_ids: batch.key.resource_ids.clone(),
            resolved_resource_ids,
            missing_resource_ids,
            resolved_resource_memory,
            command_ids: batch.command_ids.clone(),
        }
    }
}

#[cfg(test)]
mod tests;
