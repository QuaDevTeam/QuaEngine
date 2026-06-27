pub mod backend;
pub mod facade;
pub mod json_input;
mod json_validation;
pub mod metrics;
pub mod resource_update;
pub mod state;

pub use backend::{
    NativeBackendBatchDrawPlan, NativeBackendDrawCommandPlan,
    NativeBackendDrawCommandResourceState, NativeBackendDrawPlan, NativeBackendPassDrawPlan,
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendErrorKind,
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderBackendResult, NativeRenderBatchSubmission, NativeRenderFallbackDiagnostic,
    NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef, NativeRenderMissingResource,
    NativeRenderPassSubmission, NativeRenderResourceMemoryBreakdown, NativeRenderSubmission,
    NullNativeRenderBackend, NullNativeRenderBackendDiagnostics,
};
#[cfg(feature = "wgpu-backend")]
pub use backend::{
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
};
pub use facade::{
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
    NativeRendererPointerEventDispatch,
};
pub use json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonFrameInput, NativeRendererJsonParseError,
};
pub use metrics::{
    NativeRendererFrameMetrics, NativeRendererMetrics, NativeRendererResourceMetrics,
};
pub use resource_update::{
    NativeRendererFrameAudioResourceSyncSummary, NativeRendererFrameResourceSyncSummary,
    NativeRendererFrameUpdate, NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
    NativeRendererPackageReleaseSummary,
};
pub use state::NativeRendererState;

#[cfg(test)]
mod tests;
