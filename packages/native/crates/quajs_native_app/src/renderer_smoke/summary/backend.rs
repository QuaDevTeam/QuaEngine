use std::collections::BTreeMap;

use serde::Serialize;

use quajs_wgpu_renderer::renderer::{NativeBackendEncoderSkipReason, NativeBackendExecutionReport};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeBackendSummary {
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
    pub skipped_draws_by_reason: BTreeMap<String, usize>,
    pub missing_resource_ids: Vec<String>,
    pub skipped_draws_by_owner_package: BTreeMap<String, usize>,
    pub skipped_draws_by_required_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_owner_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_required_package: BTreeMap<String, usize>,
}

impl NativeRendererSmokeBackendSummary {
    pub(super) fn from_execution_report(report: &NativeBackendExecutionReport) -> Self {
        Self {
            pass_count: report.pass_count,
            command_count: report.command_count,
            pipeline_bind_count: report.pipeline_bind_count,
            clip_set_count: report.clip_set_count,
            clip_clear_count: report.clip_clear_count,
            max_clip_depth: report.max_clip_depth,
            resource_bind_count: report.resource_bind_count,
            bound_resource_reference_count: report.bound_resource_reference_count,
            unique_resource_count: report.unique_resource_count,
            draw_count: report.draw_count,
            skipped_draw_count: report.skipped_draw_count,
            missing_resource_reference_count: report.missing_resource_reference_count,
            unique_missing_resource_count: report.unique_missing_resource_count,
            validation_error_count: report.validation_error_count,
            skipped_draws_by_reason: skipped_draw_reason_summary(&report.skips_by_reason),
            missing_resource_ids: report
                .missing_resource_ids
                .iter()
                .map(|resource_id| resource_id.as_str().to_string())
                .collect(),
            skipped_draws_by_owner_package: report.skipped_draws_by_owner_package.clone(),
            skipped_draws_by_required_package: report.skipped_draws_by_required_package.clone(),
            missing_resource_references_by_owner_package: report
                .missing_resource_references_by_owner_package
                .clone(),
            missing_resource_references_by_required_package: report
                .missing_resource_references_by_required_package
                .clone(),
        }
    }
}

fn skipped_draw_reason_summary(
    by_reason: &BTreeMap<NativeBackendEncoderSkipReason, usize>,
) -> BTreeMap<String, usize> {
    by_reason
        .iter()
        .map(|(reason, count)| (backend_skip_reason_smoke_key(*reason).to_string(), *count))
        .collect()
}

fn backend_skip_reason_smoke_key(reason: NativeBackendEncoderSkipReason) -> &'static str {
    match reason {
        NativeBackendEncoderSkipReason::MissingResources => "missingResources",
    }
}
