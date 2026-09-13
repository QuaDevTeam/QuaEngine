use std::fmt::{Display, Formatter};

use super::parse_surface_format;
use crate::renderer::backend::wgpu::{WgpuNativeRenderBackendConfig, WgpuPresentMode};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeSurfaceConfigRequest {
    pub width: u32,
    pub height: u32,
    pub preferred_format: Option<wgpu::TextureFormat>,
    pub present_mode: WgpuPresentMode,
    pub desired_maximum_frame_latency: u32,
}

impl WgpuNativeSurfaceConfigRequest {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            preferred_format: None,
            present_mode: WgpuPresentMode::Fifo,
            desired_maximum_frame_latency: 2,
        }
    }

    pub fn from_backend_config(
        width: u32,
        height: u32,
        config: &WgpuNativeRenderBackendConfig,
    ) -> Result<Self, WgpuNativeSurfaceConfigError> {
        Ok(Self {
            width,
            height,
            preferred_format: config
                .surface_format
                .as_deref()
                .map(parse_surface_format)
                .transpose()?,
            present_mode: config.present_mode,
            desired_maximum_frame_latency: 2,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeSurfaceConfigPlan {
    pub config: wgpu::SurfaceConfiguration,
    pub requested_present_mode: wgpu::PresentMode,
    pub present_mode_fallback: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeSurfaceConfigError {
    pub kind: WgpuNativeSurfaceConfigErrorKind,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeSurfaceConfigErrorKind {
    UnsupportedSurfaceUsage,
    MissingFormat,
    InvalidFormat,
    UnsupportedFormat,
    MissingPresentMode,
    MissingAlphaMode,
}

impl Display for WgpuNativeSurfaceConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for WgpuNativeSurfaceConfigError {}

pub(super) fn surface_error(
    kind: WgpuNativeSurfaceConfigErrorKind,
    message: impl Into<String>,
) -> WgpuNativeSurfaceConfigError {
    WgpuNativeSurfaceConfigError {
        kind,
        message: message.into(),
    }
}
