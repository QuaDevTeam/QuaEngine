use std::collections::{BTreeMap, BTreeSet};

use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderGraph, RenderPlane};
use crate::resources::{
    infer_resource_kind, NativeResourceKind, NativeResourceLedger, ResourceId, ResourceMemory,
};

use super::{NativeRenderPassSubmission, NativeRenderSubmission};
use crate::renderer::NativeRenderBackendError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderMissingResource {
    pub resource_id: ResourceId,
    pub plane: RenderPlane,
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub command_ids: Vec<String>,
    pub owner_package_ids: BTreeSet<String>,
    pub required_package_ids: BTreeSet<String>,
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
    pub missing_resources_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub missing_resources_by_owner_package: BTreeMap<String, usize>,
    pub missing_resources_by_required_package: BTreeMap<String, usize>,
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
        let mut missing_resources_by_kind = BTreeMap::new();
        let mut missing_resources_by_owner_package = BTreeMap::new();
        let mut missing_resources_by_required_package = BTreeMap::new();

        for missing in submissions
            .iter()
            .flat_map(|submission| submission.missing_resources.iter())
        {
            *missing_resources_by_kind
                .entry(missing.resource_kind())
                .or_default() += 1;

            for package_id in &missing.owner_package_ids {
                *missing_resources_by_owner_package
                    .entry(package_id.clone())
                    .or_default() += 1;
            }
            for package_id in &missing.required_package_ids {
                *missing_resources_by_required_package
                    .entry(package_id.clone())
                    .or_default() += 1;
            }
        }

        Self {
            frames_with_missing_resources,
            missing_resource_count,
            last_missing_resources,
            missing_resources_by_kind,
            missing_resources_by_owner_package,
            missing_resources_by_required_package,
        }
    }
}

impl NativeRenderMissingResource {
    pub fn resource_kind(&self) -> NativeResourceKind {
        infer_resource_kind(&self.resource_id, self.kind)
    }
}

pub(super) fn collect_missing_resources(
    passes: &[NativeRenderPassSubmission],
    graph: &RenderGraph,
) -> Vec<NativeRenderMissingResource> {
    let package_provenance = MissingResourcePackageProvenance::from_graph(graph);
    passes
        .iter()
        .flat_map(|pass| {
            pass.batches.iter().flat_map(|batch| {
                batch
                    .missing_resource_ids
                    .iter()
                    .cloned()
                    .map(|resource_id| {
                        let provenance = package_provenance.for_command_ids(&batch.command_ids);
                        NativeRenderMissingResource {
                            resource_id,
                            plane: pass.plane,
                            pipeline: batch.pipeline,
                            kind: batch.kind,
                            command_ids: batch.command_ids.clone(),
                            owner_package_ids: provenance.owner_package_ids,
                            required_package_ids: provenance.required_package_ids,
                        }
                    })
            })
        })
        .collect()
}

#[derive(Clone, Debug, Default)]
struct MissingResourcePackageProvenance {
    by_command_id: BTreeMap<String, MissingResourcePackageIds>,
}

impl MissingResourcePackageProvenance {
    fn from_graph(graph: &RenderGraph) -> Self {
        Self {
            by_command_id: graph
                .commands()
                .iter()
                .map(|command| {
                    (
                        command.id.clone(),
                        MissingResourcePackageIds {
                            owner_package_ids: command.owner_package_id.iter().cloned().collect(),
                            required_package_ids: command.required_package_ids.clone(),
                        },
                    )
                })
                .collect(),
        }
    }

    fn for_command_ids(&self, command_ids: &[String]) -> MissingResourcePackageIds {
        let mut ids = MissingResourcePackageIds::default();
        for command_id in command_ids {
            if let Some(command_ids) = self.by_command_id.get(command_id) {
                ids.owner_package_ids
                    .extend(command_ids.owner_package_ids.iter().cloned());
                ids.required_package_ids
                    .extend(command_ids.required_package_ids.iter().cloned());
            }
        }
        ids
    }
}

#[derive(Clone, Debug, Default)]
struct MissingResourcePackageIds {
    owner_package_ids: BTreeSet<String>,
    required_package_ids: BTreeSet<String>,
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
