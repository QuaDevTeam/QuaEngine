pub mod backend;
pub mod facade;
pub mod metrics;
pub mod state;

pub use backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendErrorKind,
    NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
    NullNativeRenderBackend, NullNativeRenderBackendDiagnostics,
};
#[cfg(feature = "wgpu-backend")]
pub use backend::{
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig, WgpuNativeRenderBackendDiagnostics,
};
pub use facade::{NativeRenderer, NativeRendererFrameResult};
pub use metrics::{
    NativeRendererFrameMetrics, NativeRendererMetrics, NativeRendererResourceMetrics,
};
pub use state::{NativeRendererFrameUpdate, NativeRendererPackageRelease, NativeRendererState};

#[cfg(test)]
mod tests;
