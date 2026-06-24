use std::collections::{BTreeMap, BTreeSet};

use crate::frame::PreparedNativeFrame;
use crate::render_graph::{
    DrawBatch, DrawBatchPipeline, DrawCommandKind, RenderPlane, RenderViewport,
};
use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId, ResourceMemory};

use super::NativeRenderBackendError;

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

        NativeRenderSubmission {
            revision: self.revision,
            pass_count: self.frame.passes.passes.len(),
            batch_count: self.frame.passes.batch_count,
            command_count: self.frame.summary.command_count,
            resource_count: self.resources.len(),
            missing_resource_count: missing_resources.len(),
            missing_resources,
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderMissingResource {
    pub resource_id: ResourceId,
    pub plane: RenderPlane,
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub command_ids: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderResourceMemoryBreakdown {
    pub total: ResourceMemory,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceMemory>,
    pub by_owner_package: BTreeMap<String, ResourceMemory>,
    pub by_required_package: BTreeMap<String, ResourceMemory>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderBackendResourceDiagnostics {
    pub frames_with_missing_resources: usize,
    pub missing_resource_count: usize,
    pub last_missing_resources: Vec<NativeRenderMissingResource>,
}

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

impl NativeRenderBackendResourceDiagnostics {
    pub fn from_submissions(submissions: &[NativeRenderSubmission]) -> Self {
        let frames_with_missing_resources = submissions
            .iter()
            .filter(|submission| submission.missing_resource_count > 0)
            .count();
        let missing_resource_count = submissions
            .iter()
            .map(|submission| submission.missing_resource_count)
            .sum();
        let last_missing_resources = submissions
            .iter()
            .rev()
            .find(|submission| submission.missing_resource_count > 0)
            .map(|submission| submission.missing_resources.clone())
            .unwrap_or_default();

        Self {
            frames_with_missing_resources,
            missing_resource_count,
            last_missing_resources,
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

fn collect_missing_resources(
    passes: &[NativeRenderPassSubmission],
) -> Vec<NativeRenderMissingResource> {
    passes
        .iter()
        .flat_map(|pass| {
            pass.batches.iter().flat_map(|batch| {
                batch
                    .missing_resource_ids
                    .iter()
                    .cloned()
                    .map(|resource_id| NativeRenderMissingResource {
                        resource_id,
                        plane: pass.plane,
                        pipeline: batch.pipeline,
                        kind: batch.kind,
                        command_ids: batch.command_ids.clone(),
                    })
            })
        })
        .collect()
}

fn summarize_resolved_resources<I>(
    resource_ids: I,
    resources: &NativeResourceLedger,
) -> NativeRenderResourceMemoryBreakdown
where
    I: IntoIterator<Item = ResourceId>,
{
    let mut seen = BTreeSet::new();
    let mut summary = NativeRenderResourceMemoryBreakdown::default();

    for id in resource_ids {
        if !seen.insert(id.clone()) {
            continue;
        }

        if let Some(record) = resources.get(id) {
            summary.total.add_assign(record.memory);
            summary
                .by_kind
                .entry(record.kind)
                .or_default()
                .add_assign(record.memory);

            if let Some(owner_package_id) = &record.owner_package_id {
                summary
                    .by_owner_package
                    .entry(owner_package_id.clone())
                    .or_default()
                    .add_assign(record.memory);
            }

            for required_package_id in &record.required_package_ids {
                summary
                    .by_required_package
                    .entry(required_package_id.clone())
                    .or_default()
                    .add_assign(record.memory);
            }
        }
    }

    summary
}

#[cfg(test)]
mod tests;
