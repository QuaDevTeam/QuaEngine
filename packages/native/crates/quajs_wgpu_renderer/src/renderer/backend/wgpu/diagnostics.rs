use super::{
    WgpuNativeRenderBackend, WgpuNativeRenderBufferPlan, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderExecutionPlan, WgpuNativeRenderGpuFramePlan, WgpuNativeRenderMeshPlan,
    WgpuNativeRenderPassPlan, WgpuNativeRenderPipelinePlan, WgpuNativeRenderPrimitivePlan,
    WgpuNativeRenderResourceCachePlan, WgpuNativeRenderRuntimeExecutionReport,
    WgpuNativeRenderRuntimeExecutor, WgpuNativeRenderRuntimePlan, WgpuNativeRenderRuntimeSnapshot,
    WgpuNativeRenderSubmissionPlan,
};
use crate::renderer::backend::{
    NativeBackendCommandStreamPlan, NativeBackendDrawPlan, NativeBackendEncoderPlan,
    NativeBackendExecutionReport, NativeRenderBackendResourceDiagnostics,
    NativeRenderFallbackWarningDiagnostics, NativeRenderSubmission,
};

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderBackendDiagnostics {
    pub feature_enabled: bool,
    pub device_attached: bool,
    pub submitted_frames: usize,
    pub stable_plan_reuse_count: usize,
    pub resources: NativeRenderBackendResourceDiagnostics,
    pub fallback_warnings: NativeRenderFallbackWarningDiagnostics,
    pub last_submission: Option<NativeRenderSubmission>,
    pub last_draw_plan: Option<NativeBackendDrawPlan>,
    pub last_encoder_plan: Option<NativeBackendEncoderPlan>,
    pub last_command_stream_plan: Option<NativeBackendCommandStreamPlan>,
    pub last_execution_report: Option<NativeBackendExecutionReport>,
    pub last_execution_plan: Option<WgpuNativeRenderExecutionPlan>,
    pub last_primitive_plan: Option<WgpuNativeRenderPrimitivePlan>,
    pub last_mesh_plan: Option<WgpuNativeRenderMeshPlan>,
    pub last_buffer_plan: Option<WgpuNativeRenderBufferPlan>,
    pub last_render_pass_plan: Option<WgpuNativeRenderPassPlan>,
    pub last_pipeline_plan: Option<WgpuNativeRenderPipelinePlan>,
    pub last_gpu_frame_plan: Option<WgpuNativeRenderGpuFramePlan>,
    pub last_submission_plan: Option<WgpuNativeRenderSubmissionPlan>,
    pub last_device_plan: Option<WgpuNativeRenderDevicePlan>,
    pub last_resource_cache_plan: Option<WgpuNativeRenderResourceCachePlan>,
    pub last_runtime_plan: Option<WgpuNativeRenderRuntimePlan>,
    pub last_runtime_report: Option<WgpuNativeRenderRuntimeExecutionReport>,
    pub runtime_snapshot: WgpuNativeRenderRuntimeSnapshot,
    pub note: String,
}

impl<E> WgpuNativeRenderBackend<E>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    pub fn diagnostics(&self) -> WgpuNativeRenderBackendDiagnostics {
        WgpuNativeRenderBackendDiagnostics {
            feature_enabled: true,
            device_attached: self.runtime_executor.device_attached(),
            submitted_frames: self.submitted_frames,
            stable_plan_reuse_count: self.stable_plan_reuse_count,
            resources: self.resource_diagnostics.clone(),
            fallback_warnings: self.fallback_warnings.diagnostics(),
            last_submission: self.submissions.last().cloned(),
            last_draw_plan: self.last_draw_plan().cloned(),
            last_encoder_plan: self.last_encoder_plan().cloned(),
            last_command_stream_plan: self.last_command_stream_plan().cloned(),
            last_execution_report: self.last_execution_report().cloned(),
            last_execution_plan: self.last_execution_plan().cloned(),
            last_primitive_plan: self.last_primitive_plan().cloned(),
            last_mesh_plan: self.last_mesh_plan().cloned(),
            last_buffer_plan: self.last_buffer_plan().cloned(),
            last_render_pass_plan: self.last_render_pass_plan().cloned(),
            last_pipeline_plan: self.last_pipeline_plan().cloned(),
            last_gpu_frame_plan: self.last_gpu_frame_plan().cloned(),
            last_submission_plan: self.last_submission_plan().cloned(),
            last_device_plan: self.last_device_plan().cloned(),
            last_resource_cache_plan: self.last_resource_cache_plan().cloned(),
            last_runtime_plan: self.last_runtime_plan().cloned(),
            last_runtime_report: self.last_runtime_report().cloned(),
            runtime_snapshot: self.runtime_snapshot(),
            note: self.runtime_executor.diagnostic_note().to_string(),
        }
    }
}
