use super::*;
use crate::renderer::backend::wgpu::{WgpuNativeRenderBackendConfig, WgpuPresentMode};
use crate::renderer::backend::NativeRenderBackendResourcePolicy;

#[test]
fn plans_copy_dst_surface_configuration_with_preferred_format() {
    let capabilities = capabilities(
        vec![
            wgpu::TextureFormat::Rgba8Unorm,
            wgpu::TextureFormat::Bgra8UnormSrgb,
        ],
        vec![wgpu::PresentMode::Fifo],
        vec![wgpu::CompositeAlphaMode::Opaque],
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST,
    );
    let request = WgpuNativeSurfaceConfigRequest::from_backend_config(
        1280,
        720,
        &WgpuNativeRenderBackendConfig {
            surface_format: Some("Bgra8UnormSrgb".to_string()),
            present_mode: WgpuPresentMode::Fifo,
            adapter_name: None,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        },
    )
    .expect("surface request parses");

    let plan =
        plan_wgpu_surface_configuration(&capabilities, &request).expect("surface config plans");

    assert_eq!(plan.config.format, wgpu::TextureFormat::Bgra8UnormSrgb);
    assert_eq!(plan.config.width, 1280);
    assert_eq!(plan.config.height, 720);
    assert!(plan.config.usage.contains(wgpu::TextureUsages::COPY_DST));
    assert_eq!(plan.config.present_mode, wgpu::PresentMode::Fifo);
    assert!(!plan.present_mode_fallback);
}

#[test]
fn chooses_srgb_format_when_no_format_is_configured() {
    let capabilities = capabilities(
        vec![
            wgpu::TextureFormat::Rgba8Unorm,
            wgpu::TextureFormat::Rgba8UnormSrgb,
        ],
        vec![wgpu::PresentMode::Fifo],
        vec![
            wgpu::CompositeAlphaMode::Auto,
            wgpu::CompositeAlphaMode::Opaque,
        ],
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST,
    );
    let request = WgpuNativeSurfaceConfigRequest::new(0, 0);

    let plan =
        plan_wgpu_surface_configuration(&capabilities, &request).expect("surface config plans");

    assert_eq!(plan.config.format, wgpu::TextureFormat::Rgba8UnormSrgb);
    assert_eq!(plan.config.width, 1);
    assert_eq!(plan.config.height, 1);
    assert_eq!(plan.config.alpha_mode, wgpu::CompositeAlphaMode::Opaque);
}

#[test]
fn falls_back_to_fifo_when_requested_present_mode_is_unsupported() {
    let capabilities = capabilities(
        vec![wgpu::TextureFormat::Bgra8UnormSrgb],
        vec![wgpu::PresentMode::Fifo],
        vec![wgpu::CompositeAlphaMode::Opaque],
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST,
    );
    let mut request = WgpuNativeSurfaceConfigRequest::new(320, 180);
    request.present_mode = WgpuPresentMode::Immediate;

    let plan =
        plan_wgpu_surface_configuration(&capabilities, &request).expect("surface config plans");

    assert_eq!(plan.requested_present_mode, wgpu::PresentMode::Immediate);
    assert_eq!(plan.config.present_mode, wgpu::PresentMode::Fifo);
    assert!(plan.present_mode_fallback);
}

#[test]
fn rejects_surface_without_copy_dst_usage() {
    let capabilities = capabilities(
        vec![wgpu::TextureFormat::Bgra8UnormSrgb],
        vec![wgpu::PresentMode::Fifo],
        vec![wgpu::CompositeAlphaMode::Opaque],
        wgpu::TextureUsages::RENDER_ATTACHMENT,
    );
    let request = WgpuNativeSurfaceConfigRequest::new(320, 180);

    let error = plan_wgpu_surface_configuration(&capabilities, &request)
        .expect_err("COPY_DST is required for frame copy presentation");

    assert_eq!(
        error.kind,
        WgpuNativeSurfaceConfigErrorKind::UnsupportedSurfaceUsage
    );
}

#[test]
fn rejects_unknown_configured_surface_format() {
    let error = WgpuNativeSurfaceConfigRequest::from_backend_config(
        320,
        180,
        &WgpuNativeRenderBackendConfig {
            surface_format: Some("Depth32Float".to_string()),
            present_mode: WgpuPresentMode::Fifo,
            adapter_name: None,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        },
    )
    .expect_err("unknown configured format fails");

    assert_eq!(error.kind, WgpuNativeSurfaceConfigErrorKind::InvalidFormat);
}

#[test]
fn rejects_configured_format_that_surface_does_not_support() {
    let capabilities = capabilities(
        vec![wgpu::TextureFormat::Rgba8UnormSrgb],
        vec![wgpu::PresentMode::Fifo],
        vec![wgpu::CompositeAlphaMode::Opaque],
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST,
    );
    let mut request = WgpuNativeSurfaceConfigRequest::new(320, 180);
    request.preferred_format = Some(wgpu::TextureFormat::Bgra8UnormSrgb);

    let error = plan_wgpu_surface_configuration(&capabilities, &request)
        .expect_err("unsupported configured format fails");

    assert_eq!(
        error.kind,
        WgpuNativeSurfaceConfigErrorKind::UnsupportedFormat
    );
}

fn capabilities(
    formats: Vec<wgpu::TextureFormat>,
    present_modes: Vec<wgpu::PresentMode>,
    alpha_modes: Vec<wgpu::CompositeAlphaMode>,
    usages: wgpu::TextureUsages,
) -> wgpu::SurfaceCapabilities {
    wgpu::SurfaceCapabilities {
        formats,
        present_modes,
        alpha_modes,
        usages,
    }
}
