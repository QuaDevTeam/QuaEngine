mod bind_group;
mod buffer;
mod capture;
mod device;
mod draw;
mod encoder;
mod error;
mod frame_target;
mod operations;
mod pass;
mod pipeline;
#[cfg(all(test, feature = "real-wgpu-noop"))]
mod pipeline_fallback_tests;
mod presentation;
mod resource_id;
mod resources;
mod snapshot;
mod surface_target;
mod target;
mod target_resize;
mod texture;
mod textures;
mod uniforms;

pub(super) use super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};
use buffer::RealRuntimeBuffer;
pub use capture::{RealWgpuEncodedFrameCapture, RealWgpuFrameCapture, RealWgpuFrameCaptureError};
pub use device::RealWgpuNativeRenderRuntimeDevice;
use error::invalid_order;
pub use frame_target::RealRuntimeFrameTargetSnapshot;
use pass::{materialize_pass, validate_materializable_pass, RealRuntimePass};
pub use presentation::{
    RealWgpuFrameCopyReport, RealWgpuSurfacePresentReport, RealWgpuSurfacePresentStatus,
};
#[cfg(all(test, feature = "real-wgpu-noop"))]
use resources::checksum_bytes;
pub use surface_target::{
    create_real_wgpu_surface_target, RealWgpuSurfaceTargetBootstrap,
    RealWgpuSurfaceTargetBootstrapError, RealWgpuSurfaceTargetBootstrapErrorKind,
    RealWgpuSurfaceTargetBootstrapRequest,
};
pub use target::RealWgpuNativeRenderRuntimeTarget;
pub use target_resize::RealWgpuTargetResizeReport;
#[cfg(feature = "image-decode")]
pub use texture::decode_image_bytes_rgba8;
pub use texture::{RealWgpuDecodedTextureMetadata, RealWgpuDecodedTextureRgba8};

#[cfg(all(test, feature = "real-wgpu-noop"))]
mod tests;
