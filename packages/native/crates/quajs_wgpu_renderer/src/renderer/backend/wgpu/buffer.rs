mod assembly;
mod border;
mod color;
mod geometry;
mod plan;
mod rounded_clip;
pub(crate) mod text_geometry;
mod types;

pub use plan::{WgpuNativeRenderBufferPass, WgpuNativeRenderBufferPlan};
pub use types::{
    WgpuNativeRenderBufferVertex, WgpuNativeRenderDrawCall, WgpuNativeRenderSkippedQuad,
    WgpuNativeRenderSkippedQuadReason,
};

#[cfg(test)]
mod tests;
