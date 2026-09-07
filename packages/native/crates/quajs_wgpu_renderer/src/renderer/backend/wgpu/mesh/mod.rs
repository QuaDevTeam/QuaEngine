mod color;
mod geometry;
mod paint;
mod pass;
mod plan;
mod quad;
mod vertex;

pub(in crate::renderer::backend::wgpu) use color::parse_color_literal;
pub use color::{WgpuNativeRenderColor, WgpuNativeRenderPaintColor};
pub use paint::{WgpuNativeRenderPaint, WgpuNativeRenderQuadBorder, WgpuNativeRenderTextOverlay};
pub use pass::WgpuNativeRenderMeshPass;
pub use plan::WgpuNativeRenderMeshPlan;
pub use quad::WgpuNativeRenderQuad;
pub use vertex::WgpuNativeRenderVertex;

#[cfg(test)]
mod tests;
