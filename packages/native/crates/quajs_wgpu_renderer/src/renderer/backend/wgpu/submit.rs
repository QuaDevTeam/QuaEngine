use super::{
    WgpuNativeRenderBackend, WgpuNativeRenderBufferPlan, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderExecutionPlan, WgpuNativeRenderGpuFramePlan, WgpuNativeRenderMeshPlan,
    WgpuNativeRenderPassPlan, WgpuNativeRenderPipelinePlan, WgpuNativeRenderPrimitivePlan,
    WgpuNativeRenderResourceCachePlan, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimePlan, WgpuNativeRenderSubmissionPlan,
};
use crate::renderer::backend::{
    NativeBackendFramePlan, NativeRenderBackend, NativeRenderBackendError,
    NativeRenderBackendResult, NativeRenderFrameRef,
};

impl<E> NativeRenderBackend for WgpuNativeRenderBackend<E>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.config
            .resource_policy
            .validate_submission(&submission)?;
        if self.can_reuse_stable_device_plan(&submission) {
            return self.submit_reused_stable_plan(submission);
        }
        let frame_plan =
            NativeBackendFramePlan::from_submission_and_resources(submission, frame.resources);
        let execution_plan = WgpuNativeRenderExecutionPlan::from_command_stream_plan(
            &frame_plan.command_stream_plan,
        );
        let primitive_plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan);
        let mesh_plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan);
        let buffer_plan = WgpuNativeRenderBufferPlan::from_mesh_plan_with_font_atlases(
            &mesh_plan,
            &self.font_atlas_layouts,
        );
        let render_pass_plan = WgpuNativeRenderPassPlan::from_buffer_plan(&buffer_plan);
        let pipeline_plan = WgpuNativeRenderPipelinePlan::from_render_pass_plan(&render_pass_plan);
        let gpu_frame_plan = WgpuNativeRenderGpuFramePlan::from_buffer_and_pipeline_plans(
            &buffer_plan,
            &pipeline_plan,
        );
        let submission_plan = WgpuNativeRenderSubmissionPlan::from_gpu_frame_plan(&gpu_frame_plan);
        let device_plan = WgpuNativeRenderDevicePlan::from_submission_plan(&submission_plan);
        let previous_resource_cache_plan = self.previous_resource_cache_plan_for_submit();
        let resource_cache_plan = WgpuNativeRenderResourceCachePlan::from_device_plan(
            previous_resource_cache_plan.as_ref(),
            &device_plan,
        );
        let runtime_plan = WgpuNativeRenderRuntimePlan::from_device_and_cache_plans(
            &device_plan,
            &resource_cache_plan,
        );
        let runtime_report = self
            .runtime_executor
            .apply_runtime_plan(&runtime_plan)
            .map_err(|error| NativeRenderBackendError::backend_rejected(error.to_string()))?;
        self.invalidated_bind_group_cache_labels.clear();
        self.fallback_warnings
            .record_submission(&frame_plan.submission.fallback_diagnostics);
        self.submissions.push(frame_plan.submission.clone());
        self.draw_plans.push(frame_plan.draw_plan);
        self.encoder_plans.push(frame_plan.encoder_plan);
        self.command_stream_plans
            .push(frame_plan.command_stream_plan);
        self.execution_reports.push(frame_plan.execution_report);
        self.execution_plans.push(execution_plan);
        self.primitive_plans.push(primitive_plan);
        self.mesh_plans.push(mesh_plan);
        self.buffer_plans.push(buffer_plan);
        self.render_pass_plans.push(render_pass_plan);
        self.pipeline_plans.push(pipeline_plan);
        self.gpu_frame_plans.push(gpu_frame_plan);
        self.submission_plans.push(submission_plan);
        self.device_plans.push(device_plan);
        self.resource_cache_plans.push(resource_cache_plan);
        self.runtime_plans.push(runtime_plan);
        self.runtime_reports.push(runtime_report);
        self.planned_font_atlas_upload_count = self.font_atlas_upload_count;
        Ok(frame_plan.submission)
    }

    fn resident_texture_resource_ids(&self) -> Vec<String> {
        self.runtime_snapshot().resident_texture_resource_ids
    }
}

impl<E> WgpuNativeRenderBackend<E>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    fn can_reuse_stable_device_plan(
        &self,
        submission: &crate::renderer::backend::NativeRenderSubmission,
    ) -> bool {
        self.invalidated_bind_group_cache_labels.is_empty()
            && self.planned_font_atlas_upload_count == self.font_atlas_upload_count
            && self
                .submissions
                .last()
                .map(|previous| stable_submission_equal(previous, submission))
                .unwrap_or(false)
            && self.device_plans.last().is_some()
            && self.resource_cache_plans.last().is_some()
    }

    fn submit_reused_stable_plan(
        &mut self,
        submission: crate::renderer::backend::NativeRenderSubmission,
    ) -> NativeRenderBackendResult {
        let device_plan = self
            .device_plans
            .last()
            .expect("stable device plan presence was checked")
            .clone();
        let previous_resource_cache_plan = self.previous_resource_cache_plan_for_submit();
        let resource_cache_plan = WgpuNativeRenderResourceCachePlan::from_device_plan(
            previous_resource_cache_plan.as_ref(),
            &device_plan,
        );
        let runtime_plan = WgpuNativeRenderRuntimePlan::from_reused_device_and_cache_plans(
            &device_plan,
            &resource_cache_plan,
        );
        let runtime_report = self
            .runtime_executor
            .apply_runtime_plan(&runtime_plan)
            .map_err(|error| NativeRenderBackendError::backend_rejected(error.to_string()))?;
        self.fallback_warnings
            .record_submission(&submission.fallback_diagnostics);
        self.submissions.push(submission.clone());
        replace_last_or_push(&mut self.resource_cache_plans, resource_cache_plan);
        replace_last_or_push(&mut self.runtime_plans, runtime_plan);
        replace_last_or_push(&mut self.runtime_reports, runtime_report);
        self.stable_plan_reuse_count = self.stable_plan_reuse_count.saturating_add(1);
        Ok(submission)
    }
}

fn stable_submission_equal(
    previous: &crate::renderer::backend::NativeRenderSubmission,
    current: &crate::renderer::backend::NativeRenderSubmission,
) -> bool {
    if previous.revision == current.revision {
        return previous == current;
    }

    // Renderer revisions identify frame publication, not drawable content. A
    // native window may publish a new revision for an unchanged projection;
    // that must still reuse the existing device plan and font geometry.
    let mut previous = previous.clone();
    let mut current = current.clone();
    previous.revision = 0;
    current.revision = 0;
    previous == current
}

fn replace_last_or_push<T>(values: &mut Vec<T>, value: T) {
    if let Some(last) = values.last_mut() {
        *last = value;
    } else {
        values.push(value);
    }
}
