mod accessors;
mod buffer;
mod config;
mod device_plan;
mod diagnostics;
mod execution;
mod gpu_frame;
mod mesh;
mod physical;
mod pipeline;
mod primitive;
mod render_pass;
mod resource_cache;
mod runtime_executor;
mod runtime_plan;
mod submission_plan;
mod submit;
#[cfg(feature = "real-wgpu")]
mod surface;
#[cfg(test)]
mod test_fixture;

use std::collections::BTreeSet;

use super::submission::NativeRenderFallbackWarningTracker;
use super::{
    NativeBackendCommandStreamPlan, NativeBackendDrawPlan, NativeBackendEncoderPlan,
    NativeBackendExecutionReport, NativeRenderSubmission,
};

pub use accessors::WgpuNativeRenderDecodedTextureCleanupReport;
pub use buffer::{
    WgpuNativeRenderBufferPass, WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferVertex,
    WgpuNativeRenderDrawCall, WgpuNativeRenderSkippedQuad, WgpuNativeRenderSkippedQuadReason,
};
pub use config::{WgpuNativeRenderBackendConfig, WgpuPresentMode};
pub use device_plan::{
    WgpuNativeRenderCommandEncoderPlan, WgpuNativeRenderDeviceBindGroupCacheRequest,
    WgpuNativeRenderDeviceBuffer, WgpuNativeRenderDeviceCommand,
    WgpuNativeRenderDevicePipelineCacheRequest, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderDeviceQueueWrite, WgpuNativeRenderDeviceRenderPass,
    WgpuNativeRenderDeviceStagingBuffer,
};
pub use diagnostics::WgpuNativeRenderBackendDiagnostics;
pub use execution::{
    WgpuNativeRenderDrawMetadata, WgpuNativeRenderExecutionOperation,
    WgpuNativeRenderExecutionPass, WgpuNativeRenderExecutionPlan,
    WgpuNativeRenderOperationBoundResource,
};
pub use gpu_frame::{
    WgpuNativeRenderGpuBufferUpload, WgpuNativeRenderGpuDrawBatch, WgpuNativeRenderGpuFramePass,
    WgpuNativeRenderGpuFramePlan, WgpuNativeRenderGpuSkippedDraw,
};
pub use mesh::{
    WgpuNativeRenderColor, WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan,
    WgpuNativeRenderPaint, WgpuNativeRenderPaintColor, WgpuNativeRenderQuad,
    WgpuNativeRenderQuadBorder, WgpuNativeRenderTextOverlay, WgpuNativeRenderVertex,
};
pub use physical::WgpuPhysicalRect;
pub use pipeline::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderIndexFormat,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPipelineOperation, WgpuNativeRenderPipelinePass, WgpuNativeRenderPipelinePlan,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderResourceBindGroup, WgpuNativeRenderShader,
    WgpuNativeRenderVertexAttribute, WgpuNativeRenderVertexFormat, WgpuNativeRenderVertexLayout,
    WgpuNativeRenderVertexSemantic, WgpuNativeRenderVertexStepMode,
};
pub use primitive::{
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderPrimitivePass, WgpuNativeRenderPrimitivePlan, WgpuNativeRenderTextStyle,
};
pub use render_pass::{
    WgpuNativeRenderPass, WgpuNativeRenderPassOperation, WgpuNativeRenderPassPlan,
};
pub use resource_cache::{
    WgpuNativeRenderCacheEntryStatus, WgpuNativeRenderCachedBindGroup,
    WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
    WgpuNativeRenderReleasedBindGroup, WgpuNativeRenderReleasedBuffer,
    WgpuNativeRenderReleasedPipeline, WgpuNativeRenderResourceCachePlan,
};
#[cfg(feature = "image-decode")]
pub use runtime_executor::decode_image_bytes_rgba8;
#[cfg(feature = "real-wgpu")]
pub use runtime_executor::{
    create_real_wgpu_surface_target, RealRuntimeFrameTargetSnapshot,
    RealWgpuDecodedTextureMetadata, RealWgpuDecodedTextureRgba8, RealWgpuFrameCopyReport,
    RealWgpuNativeRenderRuntimeDevice, RealWgpuNativeRenderRuntimeTarget,
    RealWgpuSurfacePresentReport, RealWgpuSurfacePresentStatus, RealWgpuSurfaceTargetBootstrap,
    RealWgpuSurfaceTargetBootstrapError, RealWgpuSurfaceTargetBootstrapErrorKind,
    RealWgpuSurfaceTargetBootstrapRequest, RealWgpuTargetResizeReport,
};
pub use runtime_executor::{
    InMemoryWgpuNativeRenderRuntimeDevice, InMemoryWgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimeResult, WgpuNativeRenderRuntimeSnapshot,
    WgpuNativeRenderRuntimeTexturePackageMemory, WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
};
pub use runtime_plan::{WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan};
pub use submission_plan::{
    WgpuNativeRenderBindGroupCacheEntry, WgpuNativeRenderGpuBufferAllocation,
    WgpuNativeRenderPipelineCacheEntry, WgpuNativeRenderQueueWrite,
    WgpuNativeRenderStagingBufferPlan, WgpuNativeRenderSubmissionCommand,
    WgpuNativeRenderSubmissionPass, WgpuNativeRenderSubmissionPlan,
};
#[cfg(feature = "real-wgpu")]
pub use surface::{
    configure_wgpu_surface_for_native_renderer, plan_wgpu_surface_configuration,
    WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind, WgpuNativeSurfaceConfigPlan,
    WgpuNativeSurfaceConfigRequest,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderBackend<E = InMemoryWgpuNativeRenderRuntimeExecutor>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    config: WgpuNativeRenderBackendConfig,
    submissions: Vec<NativeRenderSubmission>,
    draw_plans: Vec<NativeBackendDrawPlan>,
    encoder_plans: Vec<NativeBackendEncoderPlan>,
    command_stream_plans: Vec<NativeBackendCommandStreamPlan>,
    execution_reports: Vec<NativeBackendExecutionReport>,
    execution_plans: Vec<WgpuNativeRenderExecutionPlan>,
    primitive_plans: Vec<WgpuNativeRenderPrimitivePlan>,
    mesh_plans: Vec<WgpuNativeRenderMeshPlan>,
    buffer_plans: Vec<WgpuNativeRenderBufferPlan>,
    render_pass_plans: Vec<WgpuNativeRenderPassPlan>,
    pipeline_plans: Vec<WgpuNativeRenderPipelinePlan>,
    gpu_frame_plans: Vec<WgpuNativeRenderGpuFramePlan>,
    submission_plans: Vec<WgpuNativeRenderSubmissionPlan>,
    device_plans: Vec<WgpuNativeRenderDevicePlan>,
    resource_cache_plans: Vec<WgpuNativeRenderResourceCachePlan>,
    runtime_plans: Vec<WgpuNativeRenderRuntimePlan>,
    runtime_reports: Vec<WgpuNativeRenderRuntimeExecutionReport>,
    runtime_executor: E,
    fallback_warnings: NativeRenderFallbackWarningTracker,
    invalidated_bind_group_cache_labels: BTreeSet<String>,
}

impl WgpuNativeRenderBackend<InMemoryWgpuNativeRenderRuntimeExecutor> {
    pub fn new(config: WgpuNativeRenderBackendConfig) -> Self {
        Self::with_runtime_executor(config, InMemoryWgpuNativeRenderRuntimeExecutor::new())
    }
}

impl<E> WgpuNativeRenderBackend<E>
where
    E: WgpuNativeRenderRuntimeExecutor,
{
    pub fn with_runtime_executor(
        config: WgpuNativeRenderBackendConfig,
        runtime_executor: E,
    ) -> Self {
        Self {
            config,
            submissions: Vec::new(),
            draw_plans: Vec::new(),
            encoder_plans: Vec::new(),
            command_stream_plans: Vec::new(),
            execution_reports: Vec::new(),
            execution_plans: Vec::new(),
            primitive_plans: Vec::new(),
            mesh_plans: Vec::new(),
            buffer_plans: Vec::new(),
            render_pass_plans: Vec::new(),
            pipeline_plans: Vec::new(),
            gpu_frame_plans: Vec::new(),
            submission_plans: Vec::new(),
            device_plans: Vec::new(),
            resource_cache_plans: Vec::new(),
            runtime_plans: Vec::new(),
            runtime_reports: Vec::new(),
            runtime_executor,
            fallback_warnings: NativeRenderFallbackWarningTracker::default(),
            invalidated_bind_group_cache_labels: BTreeSet::new(),
        }
    }

    fn previous_resource_cache_plan_for_submit(&self) -> Option<WgpuNativeRenderResourceCachePlan> {
        let previous = self.resource_cache_plans.last()?;
        if self.invalidated_bind_group_cache_labels.is_empty() {
            return Some(previous.clone());
        }

        let mut previous = previous.clone();
        previous.bind_group_entries.retain(|entry| {
            !self
                .invalidated_bind_group_cache_labels
                .contains(&entry.cache_label)
        });
        previous.bind_group_resident_count = previous.bind_group_entries.len();
        previous.bind_group_create_count = previous
            .bind_group_entries
            .iter()
            .filter(|entry| matches!(entry.status, WgpuNativeRenderCacheEntryStatus::Create))
            .count();
        previous.bind_group_reuse_count = previous
            .bind_group_entries
            .iter()
            .filter(|entry| matches!(entry.status, WgpuNativeRenderCacheEntryStatus::Reuse))
            .count();
        Some(previous)
    }

    #[cfg(feature = "real-wgpu")]
    fn invalidate_texture_sampler_cache_entries_for_resource(
        &mut self,
        resource_id: &str,
    ) -> usize {
        let Some(previous) = self.resource_cache_plans.last() else {
            return 0;
        };

        let mut invalidated_count = 0;
        for entry in &previous.bind_group_entries {
            if entry.layout == WgpuNativeRenderBindGroupLayout::TextureSampler
                && entry.resource_ids.iter().any(|id| id == resource_id)
                && self
                    .invalidated_bind_group_cache_labels
                    .insert(entry.cache_label.clone())
            {
                invalidated_count += 1;
            }
        }
        invalidated_count
    }
}

#[cfg(test)]
mod tests;
