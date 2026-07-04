use std::collections::{BTreeMap, BTreeSet};

use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};
use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

use super::{
    NativeBackendCommandStreamCommand, NativeBackendCommandStreamPlan,
    NativeBackendCommandStreamResource, NativeBackendEncoderSkipReason,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeBackendExecutionReport {
    pub revision: u64,
    pub pass_count: usize,
    pub command_count: usize,
    pub pipeline_bind_count: usize,
    pub clip_set_count: usize,
    pub clip_clear_count: usize,
    pub max_clip_depth: usize,
    pub resource_bind_count: usize,
    pub bound_resource_reference_count: usize,
    pub unique_resource_count: usize,
    pub draw_count: usize,
    pub skipped_draw_count: usize,
    pub missing_resource_reference_count: usize,
    pub unique_missing_resource_count: usize,
    pub validation_error_count: usize,
    pub draws_by_pipeline: BTreeMap<DrawBatchPipeline, usize>,
    pub skipped_draws_by_pipeline: BTreeMap<DrawBatchPipeline, usize>,
    pub pipeline_binds_by_pipeline: BTreeMap<DrawBatchPipeline, usize>,
    pub draws_by_kind: BTreeMap<DrawCommandKind, usize>,
    pub skipped_draws_by_kind: BTreeMap<DrawCommandKind, usize>,
    pub skipped_draws_by_owner_package: BTreeMap<String, usize>,
    pub skipped_draws_by_required_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_owner_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_required_package: BTreeMap<String, usize>,
    pub skips_by_reason: BTreeMap<NativeBackendEncoderSkipReason, usize>,
    pub missing_resource_ids: BTreeSet<ResourceId>,
    pub resource_memory: ResourceMemory,
    pub resources_by_kind: BTreeMap<NativeResourceKind, NativeBackendExecutionResourceKindSummary>,
    pub resources_by_package: BTreeMap<String, NativeBackendExecutionResourcePackageSummary>,
}

impl NativeBackendExecutionReport {
    pub fn from_command_stream_plan(plan: &NativeBackendCommandStreamPlan) -> Self {
        let mut report = Self {
            revision: plan.revision,
            pass_count: plan.pass_count,
            command_count: plan.command_count,
            ..Default::default()
        };
        let mut unique_resources =
            BTreeMap::<ResourceId, NativeBackendCommandStreamResource>::new();

        for command in plan.commands() {
            match command {
                NativeBackendCommandStreamCommand::SetPipeline { pipeline } => {
                    report.pipeline_bind_count += 1;
                    *report
                        .pipeline_binds_by_pipeline
                        .entry(*pipeline)
                        .or_default() += 1;
                }
                NativeBackendCommandStreamCommand::SetClip { depth, .. } => {
                    report.clip_set_count += 1;
                    report.max_clip_depth = report.max_clip_depth.max(*depth);
                }
                NativeBackendCommandStreamCommand::ClearClip { depth } => {
                    report.clip_clear_count += 1;
                    report.max_clip_depth = report.max_clip_depth.max(*depth);
                }
                NativeBackendCommandStreamCommand::BindResources { resources, .. } => {
                    report.resource_bind_count += 1;
                    report.bound_resource_reference_count += resources.len();
                    for resource in resources {
                        unique_resources
                            .entry(resource.resource_id.clone())
                            .or_insert_with(|| resource.clone());
                    }
                }
                NativeBackendCommandStreamCommand::Draw { pipeline, kind, .. } => {
                    report.draw_count += 1;
                    *report.draws_by_pipeline.entry(*pipeline).or_default() += 1;
                    *report.draws_by_kind.entry(*kind).or_default() += 1;
                }
                NativeBackendCommandStreamCommand::SkipDraw {
                    pipeline,
                    kind,
                    metadata,
                    reason,
                    missing_resource_ids,
                    ..
                } => {
                    report.skipped_draw_count += 1;
                    report.missing_resource_reference_count += missing_resource_ids.len();
                    *report
                        .skipped_draws_by_pipeline
                        .entry(*pipeline)
                        .or_default() += 1;
                    *report.skipped_draws_by_kind.entry(*kind).or_default() += 1;
                    *report.skips_by_reason.entry(*reason).or_default() += 1;
                    record_skipped_draw_package_pressure(
                        &mut report,
                        metadata,
                        missing_resource_ids.len(),
                    );
                    report
                        .missing_resource_ids
                        .extend(missing_resource_ids.iter().cloned());
                }
            }
        }

        report.unique_missing_resource_count = report.missing_resource_ids.len();
        report.validation_error_count = plan.validate().error_count;
        report.unique_resource_count = unique_resources.len();
        for resource in unique_resources.values() {
            report.record_resource(resource);
        }

        report
    }

    fn record_resource(&mut self, resource: &NativeBackendCommandStreamResource) {
        add_memory(&mut self.resource_memory, resource.memory);

        let kind_summary = self.resources_by_kind.entry(resource.kind).or_default();
        kind_summary.resource_count += 1;
        add_memory(&mut kind_summary.memory, resource.memory);

        if let Some(package_id) = &resource.owner_package_id {
            let package_summary = self
                .resources_by_package
                .entry(package_id.clone())
                .or_default();
            package_summary.owned_resource_count += 1;
            add_memory(&mut package_summary.owned_memory, resource.memory);
        }

        for package_id in &resource.required_package_ids {
            let package_summary = self
                .resources_by_package
                .entry(package_id.clone())
                .or_default();
            package_summary.dependent_resource_count += 1;
            add_memory(&mut package_summary.dependent_memory, resource.memory);
        }
    }
}

fn record_skipped_draw_package_pressure(
    report: &mut NativeBackendExecutionReport,
    metadata: &super::NativeBackendDrawCommandMetadata,
    missing_resource_reference_count: usize,
) {
    if let Some(owner_package_id) = &metadata.owner_package_id {
        *report
            .skipped_draws_by_owner_package
            .entry(owner_package_id.clone())
            .or_default() += 1;
        *report
            .missing_resource_references_by_owner_package
            .entry(owner_package_id.clone())
            .or_default() += missing_resource_reference_count;
    }

    for required_package_id in &metadata.required_package_ids {
        *report
            .skipped_draws_by_required_package
            .entry(required_package_id.clone())
            .or_default() += 1;
        *report
            .missing_resource_references_by_required_package
            .entry(required_package_id.clone())
            .or_default() += missing_resource_reference_count;
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NativeBackendExecutionResourceKindSummary {
    pub resource_count: usize,
    pub memory: ResourceMemory,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NativeBackendExecutionResourcePackageSummary {
    pub owned_resource_count: usize,
    pub dependent_resource_count: usize,
    pub owned_memory: ResourceMemory,
    pub dependent_memory: ResourceMemory,
}

fn add_memory(total: &mut ResourceMemory, memory: ResourceMemory) {
    total.cpu_bytes = total.cpu_bytes.saturating_add(memory.cpu_bytes);
    total.gpu_bytes = total.gpu_bytes.saturating_add(memory.gpu_bytes);
}

#[cfg(test)]
mod tests;
