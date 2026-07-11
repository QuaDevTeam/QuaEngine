pub mod backend;
pub mod facade;
pub mod json_input;
pub(crate) mod json_validation;
pub mod metrics;
pub mod resource_update;
pub mod state;

#[cfg(feature = "real-wgpu")]
pub use backend::{
    configure_wgpu_surface_for_native_renderer, create_real_wgpu_surface_target,
    plan_wgpu_surface_configuration, RealWgpuEncodedFrameCapture, RealWgpuFrameCapture,
    RealWgpuFrameCaptureError, RealWgpuFrameCopyReport, RealWgpuNativeRenderRuntimeDevice,
    RealWgpuNativeRenderRuntimeTarget, RealWgpuSurfacePresentReport, RealWgpuSurfacePresentStatus,
    RealWgpuSurfaceTargetBootstrap, RealWgpuSurfaceTargetBootstrapError,
    RealWgpuSurfaceTargetBootstrapErrorKind, RealWgpuSurfaceTargetBootstrapRequest,
    RealWgpuTargetResizeReport, WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind,
    WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigRequest,
};
#[cfg(feature = "wgpu-backend")]
pub use backend::{
    InMemoryWgpuNativeRenderRuntimeDevice, InMemoryWgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
    WgpuNativeRenderBufferPass, WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferVertex,
    WgpuNativeRenderColor, WgpuNativeRenderDecodedTextureCleanupReport, WgpuNativeRenderDrawCall,
    WgpuNativeRenderExecutionOperation, WgpuNativeRenderExecutionPass,
    WgpuNativeRenderExecutionPlan, WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan,
    WgpuNativeRenderOperationBoundResource, WgpuNativeRenderPaint, WgpuNativeRenderPaintColor,
    WgpuNativeRenderPass, WgpuNativeRenderPassOperation, WgpuNativeRenderPassPlan,
    WgpuNativeRenderQuad, WgpuNativeRenderQuadBorder, WgpuNativeRenderRuntimeDevice,
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeExecutor,
    WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan, WgpuNativeRenderRuntimeResult,
    WgpuNativeRenderRuntimeSnapshot, WgpuNativeRenderSkippedQuad,
    WgpuNativeRenderSkippedQuadReason, WgpuNativeRenderTextOverlay, WgpuNativeRenderVertex,
    WgpuPhysicalRect,
};
pub use backend::{
    NativeBackendBatchDrawPlan, NativeBackendCommandStreamCommand, NativeBackendCommandStreamPass,
    NativeBackendCommandStreamPlan, NativeBackendCommandStreamResource,
    NativeBackendCommandStreamValidationError, NativeBackendCommandStreamValidationErrorKind,
    NativeBackendCommandStreamValidationReport, NativeBackendDrawCommandPlan,
    NativeBackendDrawCommandResourceState, NativeBackendDrawPlan, NativeBackendDrawResourceBinding,
    NativeBackendDrawResourceBindingState, NativeBackendEncoderPassPlan, NativeBackendEncoderPlan,
    NativeBackendEncoderSkipReason, NativeBackendEncoderStep, NativeBackendExecutionReport,
    NativeBackendExecutionResourceKindSummary, NativeBackendExecutionResourcePackageSummary,
    NativeBackendFramePlan, NativeBackendPassDrawPlan, NativeRenderBackend,
    NativeRenderBackendError, NativeRenderBackendErrorKind, NativeRenderBackendResourceDiagnostics,
    NativeRenderBackendResourcePolicy, NativeRenderBackendResult, NativeRenderBatchSubmission,
    NativeRenderFallbackDiagnostic, NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef,
    NativeRenderMissingResource, NativeRenderPassSubmission, NativeRenderResourceMemoryBreakdown,
    NativeRenderSubmission, NullNativeRenderBackend, NullNativeRenderBackendDiagnostics,
};
pub use facade::{
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
    NativeRendererMediaBackendError, NativeRendererPointerEventDispatch,
};
pub use json_input::{
    parse_native_renderer_json_frame_input, NativeRendererJsonFrameError,
    NativeRendererJsonFrameInput, NativeRendererJsonParseError, NativeRendererJsonValidationError,
};
pub use metrics::{
    NativeRendererFrameMetrics, NativeRendererMetrics, NativeRendererResourceMetrics,
};
pub use resource_update::{
    NativeRendererFrameAudioResourceSyncSummary, NativeRendererFrameFontResourceSyncSummary,
    NativeRendererFrameResourceSyncSummary, NativeRendererFrameUpdate,
    NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
    NativeRendererPackageReleaseSummary,
};
pub use state::NativeRendererState;

#[cfg(test)]
mod tests;
