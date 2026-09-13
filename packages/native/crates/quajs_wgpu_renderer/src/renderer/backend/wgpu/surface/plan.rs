use super::format::to_wgpu_present_mode;
use super::{
    surface_error, WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind,
    WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigRequest,
};

pub fn plan_wgpu_surface_configuration(
    capabilities: &wgpu::SurfaceCapabilities,
    request: &WgpuNativeSurfaceConfigRequest,
) -> Result<WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigError> {
    let required_usage = wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST;
    if !capabilities.usages.contains(required_usage) {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::UnsupportedSurfaceUsage,
            "native real-wgpu presentation requires surface textures to support RENDER_ATTACHMENT | COPY_DST",
        ));
    }

    let format = select_surface_format(capabilities, request.preferred_format)?;
    let requested_present_mode = to_wgpu_present_mode(request.present_mode);
    let present_mode = select_present_mode(capabilities, requested_present_mode)?;
    let alpha_mode = select_alpha_mode(capabilities)?;

    Ok(WgpuNativeSurfaceConfigPlan {
        config: wgpu::SurfaceConfiguration {
            usage: required_usage,
            format,
            width: request.width.max(1),
            height: request.height.max(1),
            present_mode,
            desired_maximum_frame_latency: request.desired_maximum_frame_latency.max(1),
            alpha_mode,
            view_formats: vec![],
        },
        requested_present_mode,
        present_mode_fallback: present_mode != requested_present_mode,
    })
}

pub fn configure_wgpu_surface_for_native_renderer(
    surface: &wgpu::Surface<'_>,
    adapter: &wgpu::Adapter,
    device: &wgpu::Device,
    request: &WgpuNativeSurfaceConfigRequest,
) -> Result<WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigError> {
    let capabilities = surface.get_capabilities(adapter);
    let plan = plan_wgpu_surface_configuration(&capabilities, request)?;
    surface.configure(device, &plan.config);
    Ok(plan)
}

fn select_surface_format(
    capabilities: &wgpu::SurfaceCapabilities,
    preferred: Option<wgpu::TextureFormat>,
) -> Result<wgpu::TextureFormat, WgpuNativeSurfaceConfigError> {
    if capabilities.formats.is_empty() {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::MissingFormat,
            "surface capabilities do not expose any texture formats",
        ));
    }
    if let Some(preferred) = preferred {
        if capabilities.formats.contains(&preferred) {
            return Ok(preferred);
        }
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat,
            format!(
                "configured surface format {:?} is not supported by this surface",
                preferred
            ),
        ));
    }
    capabilities
        .formats
        .iter()
        .copied()
        .find(wgpu::TextureFormat::is_srgb)
        .or_else(|| capabilities.formats.first().copied())
        .ok_or_else(|| {
            surface_error(
                WgpuNativeSurfaceConfigErrorKind::MissingFormat,
                "surface capabilities do not expose any texture formats",
            )
        })
}

fn select_present_mode(
    capabilities: &wgpu::SurfaceCapabilities,
    requested: wgpu::PresentMode,
) -> Result<wgpu::PresentMode, WgpuNativeSurfaceConfigError> {
    if capabilities.present_modes.is_empty() {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::MissingPresentMode,
            "surface capabilities do not expose any present modes",
        ));
    }
    if capabilities.present_modes.contains(&requested) {
        return Ok(requested);
    }
    Ok(capabilities
        .present_modes
        .iter()
        .copied()
        .find(|mode| *mode == wgpu::PresentMode::Fifo)
        .or_else(|| capabilities.present_modes.first().copied())
        .expect("present modes were checked above"))
}

fn select_alpha_mode(
    capabilities: &wgpu::SurfaceCapabilities,
) -> Result<wgpu::CompositeAlphaMode, WgpuNativeSurfaceConfigError> {
    if capabilities.alpha_modes.is_empty() {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::MissingAlphaMode,
            "surface capabilities do not expose any alpha modes",
        ));
    }
    Ok(capabilities
        .alpha_modes
        .iter()
        .copied()
        .find(|mode| *mode == wgpu::CompositeAlphaMode::Opaque)
        .or_else(|| capabilities.alpha_modes.first().copied())
        .expect("alpha modes were checked above"))
}
