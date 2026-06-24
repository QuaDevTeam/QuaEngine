use std::collections::{BTreeMap, BTreeSet};

use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId, ResourceMemory};

use super::{NativeRenderPassSubmission, NativeRenderSubmission};
use crate::renderer::NativeRenderBackendError;

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

pub(super) fn collect_missing_resources(
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

pub(super) fn partition_resource_ids(
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

pub(super) fn summarize_resolved_resources<I>(
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

#[cfg(test)]
mod tests;
