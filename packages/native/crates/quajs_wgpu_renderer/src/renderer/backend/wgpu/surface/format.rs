use super::{surface_error, WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind};
use crate::renderer::backend::wgpu::WgpuPresentMode;

pub(super) fn parse_surface_format(
    value: &str,
) -> Result<wgpu::TextureFormat, WgpuNativeSurfaceConfigError> {
    match value.trim() {
        "Bgra8UnormSrgb" => Ok(wgpu::TextureFormat::Bgra8UnormSrgb),
        "Bgra8Unorm" => Ok(wgpu::TextureFormat::Bgra8Unorm),
        "Rgba8UnormSrgb" => Ok(wgpu::TextureFormat::Rgba8UnormSrgb),
        "Rgba8Unorm" => Ok(wgpu::TextureFormat::Rgba8Unorm),
        format => Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::InvalidFormat,
            format!("unsupported native surface format string \"{format}\""),
        )),
    }
}

pub(super) fn to_wgpu_present_mode(mode: WgpuPresentMode) -> wgpu::PresentMode {
    match mode {
        WgpuPresentMode::Fifo => wgpu::PresentMode::Fifo,
        WgpuPresentMode::Mailbox => wgpu::PresentMode::Mailbox,
        WgpuPresentMode::Immediate => wgpu::PresentMode::Immediate,
    }
}
