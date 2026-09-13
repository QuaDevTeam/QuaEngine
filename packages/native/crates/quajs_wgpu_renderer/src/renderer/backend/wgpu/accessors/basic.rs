use super::super::{
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBufferPlan,
    WgpuNativeRenderDevicePlan, WgpuNativeRenderExecutionPlan, WgpuNativeRenderGpuFramePlan,
    WgpuNativeRenderMeshPlan, WgpuNativeRenderPassPlan, WgpuNativeRenderPipelinePlan,
    WgpuNativeRenderPrimitivePlan, WgpuNativeRenderResourceCachePlan,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimePlan, WgpuNativeRenderRuntimeSnapshot, WgpuNativeRenderSubmissionPlan,
};
use crate::renderer::backend::{
    NativeBackendCommandStreamPlan, NativeBackendDrawPlan, NativeBackendEncoderPlan,
    NativeBackendExecutionReport, NativeRenderSubmission,
};
use crate::resources::{
    plan_texture_upload_sync as plan_native_texture_upload_sync, NativeTextureUploadRequestPlan,
    NativeTextureUploadSyncPlan,
};

impl<E> WgpuNativeRenderBackend<E>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    pub fn config(&self) -> &WgpuNativeRenderBackendConfig {
        &self.config
    }

    pub fn submissions(&self) -> &[NativeRenderSubmission] {
        &self.submissions
    }

    pub fn draw_plans(&self) -> &[NativeBackendDrawPlan] {
        &self.draw_plans
    }

    pub fn last_draw_plan(&self) -> Option<&NativeBackendDrawPlan> {
        self.draw_plans.last()
    }

    pub fn encoder_plans(&self) -> &[NativeBackendEncoderPlan] {
        &self.encoder_plans
    }

    pub fn last_encoder_plan(&self) -> Option<&NativeBackendEncoderPlan> {
        self.encoder_plans.last()
    }

    pub fn command_stream_plans(&self) -> &[NativeBackendCommandStreamPlan] {
        &self.command_stream_plans
    }

    pub fn last_command_stream_plan(&self) -> Option<&NativeBackendCommandStreamPlan> {
        self.command_stream_plans.last()
    }

    pub fn execution_reports(&self) -> &[NativeBackendExecutionReport] {
        &self.execution_reports
    }

    pub fn last_execution_report(&self) -> Option<&NativeBackendExecutionReport> {
        self.execution_reports.last()
    }

    pub fn execution_plans(&self) -> &[WgpuNativeRenderExecutionPlan] {
        &self.execution_plans
    }

    pub fn last_execution_plan(&self) -> Option<&WgpuNativeRenderExecutionPlan> {
        self.execution_plans.last()
    }

    pub fn primitive_plans(&self) -> &[WgpuNativeRenderPrimitivePlan] {
        &self.primitive_plans
    }

    pub fn last_primitive_plan(&self) -> Option<&WgpuNativeRenderPrimitivePlan> {
        self.primitive_plans.last()
    }

    pub fn mesh_plans(&self) -> &[WgpuNativeRenderMeshPlan] {
        &self.mesh_plans
    }

    pub fn last_mesh_plan(&self) -> Option<&WgpuNativeRenderMeshPlan> {
        self.mesh_plans.last()
    }

    pub fn buffer_plans(&self) -> &[WgpuNativeRenderBufferPlan] {
        &self.buffer_plans
    }

    pub fn last_buffer_plan(&self) -> Option<&WgpuNativeRenderBufferPlan> {
        self.buffer_plans.last()
    }

    pub fn render_pass_plans(&self) -> &[WgpuNativeRenderPassPlan] {
        &self.render_pass_plans
    }

    pub fn last_render_pass_plan(&self) -> Option<&WgpuNativeRenderPassPlan> {
        self.render_pass_plans.last()
    }

    pub fn pipeline_plans(&self) -> &[WgpuNativeRenderPipelinePlan] {
        &self.pipeline_plans
    }

    pub fn last_pipeline_plan(&self) -> Option<&WgpuNativeRenderPipelinePlan> {
        self.pipeline_plans.last()
    }

    pub fn gpu_frame_plans(&self) -> &[WgpuNativeRenderGpuFramePlan] {
        &self.gpu_frame_plans
    }

    pub fn last_gpu_frame_plan(&self) -> Option<&WgpuNativeRenderGpuFramePlan> {
        self.gpu_frame_plans.last()
    }

    pub fn submission_plans(&self) -> &[WgpuNativeRenderSubmissionPlan] {
        &self.submission_plans
    }

    pub fn last_submission_plan(&self) -> Option<&WgpuNativeRenderSubmissionPlan> {
        self.submission_plans.last()
    }

    pub fn device_plans(&self) -> &[WgpuNativeRenderDevicePlan] {
        &self.device_plans
    }

    pub fn last_device_plan(&self) -> Option<&WgpuNativeRenderDevicePlan> {
        self.device_plans.last()
    }

    pub fn resource_cache_plans(&self) -> &[WgpuNativeRenderResourceCachePlan] {
        &self.resource_cache_plans
    }

    pub fn last_resource_cache_plan(&self) -> Option<&WgpuNativeRenderResourceCachePlan> {
        self.resource_cache_plans.last()
    }

    pub fn runtime_plans(&self) -> &[WgpuNativeRenderRuntimePlan] {
        &self.runtime_plans
    }

    pub fn last_runtime_plan(&self) -> Option<&WgpuNativeRenderRuntimePlan> {
        self.runtime_plans.last()
    }

    pub fn runtime_reports(&self) -> &[WgpuNativeRenderRuntimeExecutionReport] {
        &self.runtime_reports
    }

    pub fn last_runtime_report(&self) -> Option<&WgpuNativeRenderRuntimeExecutionReport> {
        self.runtime_reports.last()
    }

    pub fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.runtime_executor.runtime_snapshot()
    }

    pub fn plan_texture_upload_sync(
        &self,
        texture_uploads: &NativeTextureUploadRequestPlan,
    ) -> NativeTextureUploadSyncPlan {
        let snapshot = self.runtime_snapshot();
        plan_native_texture_upload_sync(
            texture_uploads,
            snapshot
                .resident_texture_resource_ids
                .iter()
                .map(String::as_str),
        )
    }

    pub fn runtime_executor(&self) -> &E {
        &self.runtime_executor
    }

    pub fn runtime_executor_mut(&mut self) -> &mut E {
        &mut self.runtime_executor
    }

    pub fn stable_plan_reuse_count(&self) -> usize {
        self.stable_plan_reuse_count
    }
}
