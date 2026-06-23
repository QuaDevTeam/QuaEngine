pub mod backend;
pub mod facade;
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
pub use state::{NativeRendererFrameUpdate, NativeRendererState};

#[cfg(test)]
mod tests;
