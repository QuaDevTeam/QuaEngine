pub mod backend;
pub mod facade;
pub mod metrics;
pub mod resource_update;
pub mod state;

pub use backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendErrorKind,
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResult, NativeRenderBatchSubmission,
    NativeRenderFrameRef, NativeRenderMissingResource, NativeRenderPassSubmission,
    NativeRenderResourceMemoryBreakdown, NativeRenderSubmission, NullNativeRenderBackend,
    NullNativeRenderBackendDiagnostics,
};
#[cfg(feature = "wgpu-backend")]
pub use backend::{
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
};
pub use facade::{NativeRenderer, NativeRendererFrameResult};
pub use metrics::{
    NativeRendererFrameMetrics, NativeRendererMetrics, NativeRendererResourceMetrics,
};
pub use resource_update::{
    NativeRendererFrameResourceSyncSummary, NativeRendererFrameUpdate,
    NativeRendererPackageRelease, NativeRendererPackageReleaseSummary,
};
pub use state::NativeRendererState;

#[cfg(test)]
mod tests;
