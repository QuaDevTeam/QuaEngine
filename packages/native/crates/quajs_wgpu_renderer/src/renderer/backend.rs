use std::fmt::{Display, Formatter};

pub mod command_stream;
pub mod draw_plan;
pub mod encoder_plan;
pub mod execution_report;
pub mod frame_plan;
pub mod null;
pub mod submission;
#[cfg(feature = "wgpu-backend")]
pub mod wgpu;

pub use command_stream::{
    NativeBackendCommandStreamCommand, NativeBackendCommandStreamPass,
    NativeBackendCommandStreamPlan, NativeBackendCommandStreamResource,
    NativeBackendCommandStreamValidationError, NativeBackendCommandStreamValidationErrorKind,
    NativeBackendCommandStreamValidationReport,
};
pub use draw_plan::{
    NativeBackendBatchDrawPlan, NativeBackendDrawCommandPlan,
    NativeBackendDrawCommandResourceState, NativeBackendDrawPlan, NativeBackendDrawResourceBinding,
    NativeBackendDrawResourceBindingState, NativeBackendPassDrawPlan,
};
pub use encoder_plan::{
    NativeBackendDrawCommandMetadata, NativeBackendEncoderPassPlan, NativeBackendEncoderPlan,
    NativeBackendEncoderSkipReason, NativeBackendEncoderStep,
};
pub use execution_report::{
    NativeBackendExecutionReport, NativeBackendExecutionResourceKindSummary,
    NativeBackendExecutionResourcePackageSummary,
};
pub use frame_plan::NativeBackendFramePlan;
pub use null::{NullNativeRenderBackend, NullNativeRenderBackendDiagnostics};
pub use submission::{
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderBatchSubmission, NativeRenderFallbackDiagnostic,
    NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef, NativeRenderMissingResource,
    NativeRenderPassSubmission, NativeRenderResourceMemoryBreakdown, NativeRenderSubmission,
};
#[cfg(feature = "image-decode")]
pub use wgpu::decode_image_bytes_rgba8;
#[cfg(feature = "real-wgpu")]
pub use wgpu::{
    configure_wgpu_surface_for_native_renderer, create_real_wgpu_surface_target,
    plan_wgpu_surface_configuration, RealRuntimeFrameTargetSnapshot, RealWgpuEncodedFrameCapture,
    RealWgpuFrameCapture, RealWgpuFrameCaptureError, RealWgpuFrameCopyReport,
    RealWgpuNativeRenderRuntimeDevice, RealWgpuNativeRenderRuntimeTarget,
    RealWgpuSurfacePresentReport, RealWgpuSurfacePresentStatus, RealWgpuSurfaceTargetBootstrap,
    RealWgpuSurfaceTargetBootstrapError, RealWgpuSurfaceTargetBootstrapErrorKind,
    RealWgpuSurfaceTargetBootstrapRequest, RealWgpuTargetResizeReport,
    WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind, WgpuNativeSurfaceConfigPlan,
    WgpuNativeSurfaceConfigRequest,
};
#[cfg(feature = "wgpu-backend")]
pub use wgpu::{
    InMemoryWgpuNativeRenderRuntimeDevice, InMemoryWgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
    WgpuNativeRenderBindGroupCacheEntry, WgpuNativeRenderBindGroupLayout,
    WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferPass,
    WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage,
    WgpuNativeRenderBufferVertex, WgpuNativeRenderCacheEntryStatus,
    WgpuNativeRenderCachedBindGroup, WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
    WgpuNativeRenderColor, WgpuNativeRenderCommandEncoderPlan,
    WgpuNativeRenderDecodedTextureCleanupReport, WgpuNativeRenderDeviceBindGroupCacheRequest,
    WgpuNativeRenderDeviceBuffer, WgpuNativeRenderDeviceCommand,
    WgpuNativeRenderDevicePipelineCacheRequest, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderDeviceQueueWrite, WgpuNativeRenderDeviceRenderPass,
    WgpuNativeRenderDeviceStagingBuffer, WgpuNativeRenderDrawCall, WgpuNativeRenderDrawMetadata,
    WgpuNativeRenderExecutionOperation, WgpuNativeRenderExecutionPass,
    WgpuNativeRenderExecutionPlan, WgpuNativeRenderGpuBufferAllocation,
    WgpuNativeRenderGpuBufferUpload, WgpuNativeRenderGpuDrawBatch, WgpuNativeRenderGpuFramePass,
    WgpuNativeRenderGpuFramePlan, WgpuNativeRenderGpuSkippedDraw, WgpuNativeRenderIndexFormat,
    WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan, WgpuNativeRenderOperationBoundResource,
    WgpuNativeRenderPaint, WgpuNativeRenderPaintColor, WgpuNativeRenderPass,
    WgpuNativeRenderPassOperation, WgpuNativeRenderPassPlan, WgpuNativeRenderPipelineCacheEntry,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPipelineOperation, WgpuNativeRenderPipelinePass, WgpuNativeRenderPipelinePlan,
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderPrimitivePass, WgpuNativeRenderPrimitivePlan,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderQuad, WgpuNativeRenderQuadBorder,
    WgpuNativeRenderQueueWrite, WgpuNativeRenderReleasedBindGroup, WgpuNativeRenderReleasedBuffer,
    WgpuNativeRenderReleasedPipeline, WgpuNativeRenderResourceBindGroup,
    WgpuNativeRenderResourceCachePlan, WgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError,
    WgpuNativeRenderRuntimeErrorKind, WgpuNativeRenderRuntimeExecutionReport,
    WgpuNativeRenderRuntimeExecutor, WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
    WgpuNativeRenderRuntimeResult, WgpuNativeRenderRuntimeSnapshot,
    WgpuNativeRenderRuntimeTexturePackageMemory, WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
    WgpuNativeRenderShader, WgpuNativeRenderSkippedQuad, WgpuNativeRenderSkippedQuadReason,
    WgpuNativeRenderStagingBufferPlan, WgpuNativeRenderSubmissionCommand,
    WgpuNativeRenderSubmissionPass, WgpuNativeRenderSubmissionPlan, WgpuNativeRenderTextOverlay,
    WgpuNativeRenderVertex, WgpuNativeRenderVertexAttribute, WgpuNativeRenderVertexFormat,
    WgpuNativeRenderVertexLayout, WgpuNativeRenderVertexSemantic, WgpuNativeRenderVertexStepMode,
    WgpuPhysicalRect,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeRenderBackendErrorKind {
    NoPreparedFrame,
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderBackendError {
    pub kind: NativeRenderBackendErrorKind,
    pub message: String,
}

impl NativeRenderBackendError {
    pub fn no_prepared_frame() -> Self {
        Self {
            kind: NativeRenderBackendErrorKind::NoPreparedFrame,
            message: "Native renderer has no prepared frame to submit.".to_string(),
        }
    }

    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeRenderBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

impl Display for NativeRenderBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for NativeRenderBackendError {}

pub type NativeRenderBackendResult = Result<NativeRenderSubmission, NativeRenderBackendError>;

pub trait NativeRenderBackend {
    /// Content height in logical units, using resident font metrics. None while fonts are unavailable.
    fn measure_text_height(
        &self,
        _text: &crate::render_graph::TextDrawParams,
        _width: f64,
        _physical_scale: f64,
    ) -> Option<f64> {
        None
    }

    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult;

    fn resident_texture_resource_ids(&self) -> Vec<String> {
        Vec::new()
    }
}
