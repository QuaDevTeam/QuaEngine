use super::format::to_wgpu_present_mode;
use super::{
    surface_error, WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigErrorKind,
    WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigRequest,
};

pub fn plan_wgpu_surface_configuration(
    capabilities: &wgpu::SurfaceCapabilities,
    request: &WgpuNativeSurfaceConfigRequest,
) -> Result<WgpuNativeSurfaceConfigPlan, WgpuNativeSurfaceConfigError> {
    let mut required_usage = wgpu::TextureUsages::RENDER_ATTACHMENT;
    if !capabilities.usages.contains(required_usage) {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::UnsupportedSurfaceUsage,
            "native real-wgpu presentation requires surface textures to support RENDER_ATTACHMENT",
        ));
    }

    let format = select_surface_format(capabilities, request)?;
    if !matches!(
        format,
        wgpu::TextureFormat::Rgba16Float | wgpu::TextureFormat::Rgb10a2Unorm
    ) && capabilities.usages.contains(wgpu::TextureUsages::COPY_DST)
    {
        required_usage |= wgpu::TextureUsages::COPY_DST;
    }
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
        sdr_white_scale: request.sdr_white_scale,
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
    let mut request = request.clone();
    let backend = adapter.get_info().backend;
    // Vulkan maps FP16 specifically to EXTENDED_SRGB_LINEAR_EXT. DXGI's
    // FP16 swapchain default is scRGB. Metal's layer is tagged below.
    request.display_hdr_available &= matches!(backend, wgpu::Backend::Vulkan | wgpu::Backend::Dx12)
        || (cfg!(all(target_os = "macos", feature = "real-wgpu-native"))
            && backend == wgpu::Backend::Metal);
    let plan = plan_wgpu_surface_configuration(&capabilities, &request)?;
    surface.configure(device, &plan.config);
    #[cfg(all(target_os = "macos", feature = "real-wgpu-native"))]
    if backend == wgpu::Backend::Metal {
        use objc2_core_graphics::{
            kCGColorSpaceExtendedLinearSRGB, kCGColorSpaceSRGB, CGColorSpace,
        };
        // SAFETY: we borrow the live Metal layer under HAL's lock. The two
        // system CGColorSpace name constants outlive the surface.
        unsafe {
            let metal = surface.as_hal::<wgpu::hal::api::Metal>().ok_or_else(|| {
                surface_error(
                    WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat,
                    "Metal surface unavailable",
                )
            })?;
            let name = if plan.config.format == wgpu::TextureFormat::Rgba16Float {
                kCGColorSpaceExtendedLinearSRGB
            } else {
                kCGColorSpaceSRGB
            };
            let space = CGColorSpace::with_name(Some(name)).ok_or_else(|| {
                surface_error(
                    WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat,
                    "Core Graphics color space unavailable",
                )
            })?;
            metal.render_layer().lock().setColorspace(Some(&space));
        }
    }
    Ok(plan)
}

fn select_surface_format(
    capabilities: &wgpu::SurfaceCapabilities,
    request: &WgpuNativeSurfaceConfigRequest,
) -> Result<wgpu::TextureFormat, WgpuNativeSurfaceConfigError> {
    use wgpu::TextureFormat::{
        Bgra8Unorm, Bgra8UnormSrgb, Rgb10a2Unorm, Rgba16Float, Rgba8Unorm, Rgba8UnormSrgb,
    };

    if capabilities.formats.is_empty() {
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::MissingFormat,
            "surface capabilities do not expose any texture formats",
        ));
    }
    let hdr = request.display_hdr_available
        && request.sdr_white_scale.is_finite()
        && request.sdr_white_scale > 0.0
        && capabilities.formats.contains(&Rgba16Float);
    let sdr8 = |f: wgpu::TextureFormat| {
        matches!(f, Bgra8Unorm | Bgra8UnormSrgb | Rgba8Unorm | Rgba8UnormSrgb)
    };
    if let Some(preferred) = request.preferred_format {
        if ((sdr8(preferred) || preferred == Rgb10a2Unorm)
            && capabilities.formats.contains(&preferred))
            || (preferred == Rgba16Float && hdr)
        {
            return Ok(preferred);
        }
        return Err(surface_error(
            WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat,
            format!("configured surface format {preferred:?} is unavailable on this display"),
        ));
    }
    if hdr {
        return Ok(Rgba16Float);
    }
    let formats = || capabilities.formats.iter().copied().filter(|f| sdr8(*f));
    formats()
        .find(wgpu::TextureFormat::is_srgb)
        .or_else(|| formats().next())
        // A 10-bit UNORM surface uses ordinary SDR transfer, never PQ.
        .or_else(|| {
            capabilities
                .formats
                .contains(&Rgb10a2Unorm)
                .then_some(Rgb10a2Unorm)
        })
        .ok_or_else(|| {
            surface_error(
                WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat,
                "surface has no compatible native sRGB presentation format",
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
