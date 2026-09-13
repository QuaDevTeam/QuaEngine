use std::collections::BTreeMap;

use super::{
    InMemoryWgpuNativeRenderRuntimeExecutor, WgpuNativeRenderRuntimeDevice,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimeResult,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
};

impl<D> WgpuNativeRenderRuntimeExecutor for InMemoryWgpuNativeRenderRuntimeExecutor<D>
where
    D: WgpuNativeRenderRuntimeDevice,
{
    fn apply_runtime_plan(
        &mut self,
        plan: &WgpuNativeRenderRuntimePlan,
    ) -> WgpuNativeRenderRuntimeResult {
        let mut device = self.device.clone();
        let mut report = WgpuNativeRenderRuntimeExecutionReport::from_plan(plan);

        device.begin_runtime_plan(plan)?;
        for operation in &plan.operations {
            device.apply_runtime_operation(operation, &mut report)?;
        }
        device.finish_runtime_plan()?;
        report.applied_operation_count = plan.operations.len();
        report.capture_snapshot(device.runtime_snapshot());
        self.device = device;
        if self.applied_reports.len() == 2 {
            self.applied_reports.remove(0);
        }
        self.applied_reports.push(report.clone());
        Ok(report)
    }

    fn runtime_snapshot(&self) -> super::WgpuNativeRenderRuntimeSnapshot {
        self.snapshot()
    }

    fn device_attached(&self) -> bool {
        self.device.device_attached()
    }

    fn diagnostic_note(&self) -> &'static str {
        self.device.diagnostic_note()
    }
}

impl WgpuNativeRenderRuntimeExecutionReport {
    fn from_plan(plan: &WgpuNativeRenderRuntimePlan) -> Self {
        let skipped_draws = summarize_skipped_draws(plan);

        Self {
            revision: plan.revision,
            operation_count: plan.operation_count,
            cache_operation_count: plan.cache_operation_count,
            release_operation_count: plan.release_operation_count,
            queue_write_count: plan.queue_write_count,
            queue_write_byte_len: plan.queue_write_byte_len,
            encoder_count: plan.encoder_count,
            render_pass_count: plan.render_pass_count,
            draw_indexed_count: plan.draw_indexed_count,
            skipped_draw_count: plan.skipped_draw_count,
            skipped_draws_by_reason: skipped_draws.by_reason,
            missing_resource_references_by_resource_id: skipped_draws
                .missing_references_by_resource_id,
            skipped_draws_by_owner_package: skipped_draws.by_owner_package,
            skipped_draws_by_required_package: skipped_draws.by_required_package,
            missing_resource_references_by_owner_package: skipped_draws
                .missing_references_by_owner_package,
            missing_resource_references_by_required_package: skipped_draws
                .missing_references_by_required_package,
            submit_count: plan.submit_count,
            ..Default::default()
        }
    }

    fn capture_snapshot(&mut self, snapshot: super::WgpuNativeRenderRuntimeSnapshot) {
        self.resident_buffer_count = snapshot.resident_buffer_count;
        self.resident_buffer_byte_len = snapshot.resident_buffer_byte_len;
        self.resident_pipeline_count = snapshot.resident_pipeline_count;
        self.resident_bind_group_count = snapshot.resident_bind_group_count;
        self.resident_texture_count = snapshot.resident_texture_count;
        self.resident_texture_byte_len = snapshot.resident_texture_byte_len;
        self.resident_compositor_texture_byte_len = snapshot.resident_compositor_texture_byte_len;
        self.resident_texture_resource_ids = snapshot.resident_texture_resource_ids;
        self.resident_texture_byte_len_by_package = snapshot.resident_texture_byte_len_by_package;
        self.texture_sampler_diagnostics = snapshot.texture_sampler_diagnostics;
        self.submitted_command_buffer_count = snapshot.submitted_command_buffer_count;
    }
}

#[derive(Default)]
struct RuntimeSkippedDrawSummary {
    by_reason: BTreeMap<String, usize>,
    missing_references_by_resource_id: BTreeMap<String, usize>,
    by_owner_package: BTreeMap<String, usize>,
    by_required_package: BTreeMap<String, usize>,
    missing_references_by_owner_package: BTreeMap<String, usize>,
    missing_references_by_required_package: BTreeMap<String, usize>,
}

fn summarize_skipped_draws(plan: &WgpuNativeRenderRuntimePlan) -> RuntimeSkippedDrawSummary {
    let mut summary = RuntimeSkippedDrawSummary::default();

    for operation in &plan.operations {
        if let WgpuNativeRenderRuntimeOperation::SkipDraw {
            reason,
            resource_ids,
            owner_package_id,
            required_package_ids,
            ..
        } = operation
        {
            let missing_resources = is_missing_resource_skip_reason(reason);
            *summary.by_reason.entry(reason.clone()).or_default() += 1;
            if let Some(owner_package_id) = owner_package_id {
                *summary
                    .by_owner_package
                    .entry(owner_package_id.clone())
                    .or_default() += 1;
                if missing_resources {
                    *summary
                        .missing_references_by_owner_package
                        .entry(owner_package_id.clone())
                        .or_default() += resource_ids.len();
                }
            }
            for package_id in required_package_ids {
                *summary
                    .by_required_package
                    .entry(package_id.clone())
                    .or_default() += 1;
                if missing_resources {
                    *summary
                        .missing_references_by_required_package
                        .entry(package_id.clone())
                        .or_default() += resource_ids.len();
                }
            }
            if missing_resources {
                for resource_id in resource_ids {
                    *summary
                        .missing_references_by_resource_id
                        .entry(resource_id.clone())
                        .or_default() += 1;
                }
            }
        }
    }

    summary
}

fn is_missing_resource_skip_reason(reason: &str) -> bool {
    matches!(reason, "missing-resources" | "missing resources")
}
