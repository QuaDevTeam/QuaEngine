mod build;
mod plan;
mod types;

pub use plan::{WgpuNativeRenderPrimitivePass, WgpuNativeRenderPrimitivePlan};
pub use types::{
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderTextStyle,
};

#[cfg(test)]
mod tests;
