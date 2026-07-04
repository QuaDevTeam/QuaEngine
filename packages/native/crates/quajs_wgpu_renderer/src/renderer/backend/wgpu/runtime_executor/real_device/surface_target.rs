use std::fmt::{Display, Formatter};

use super::RealWgpuNativeRenderRuntimeTarget;
use crate::renderer::backend::wgpu::{
    configure_wgpu_surface_for_native_renderer, plan_wgpu_surface_configuration,
    WgpuNativeRenderBackendConfig, WgpuNativeSurfaceConfigError, WgpuNativeSurfaceConfigPlan,
    WgpuNativeSurfaceConfigRequest,
};

#[derive(Debug)]
pub struct RealWgpuSurfaceTargetBootstrap {
    pub adapter: wgpu::Adapter,
    pub adapter_info: wgpu::AdapterInfo,
    pub surface_config: WgpuNativeSurfaceConfigPlan,
    pub target: RealWgpuNativeRenderRuntimeTarget,
}

#[derive(Clone, Debug)]
pub struct RealWgpuSurfaceTargetBootstrapRequest<'a> {
    pub width: u32,
    pub height: u32,
    pub backend_config: WgpuNativeRenderBackendConfig,
    pub power_preference: wgpu::PowerPreference,
    pub force_fallback_adapter: bool,
    pub device_descriptor: wgpu::DeviceDescriptor<'a>,
}

impl<'a> RealWgpuSurfaceTargetBootstrapRequest<'a> {
    pub fn new(width: u32, height: u32, backend_config: WgpuNativeRenderBackendConfig) -> Self {
        Self {
            width,
            height,
            backend_config,
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            device_descriptor: wgpu::DeviceDescriptor::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RealWgpuSurfaceTargetBootstrapError {
    pub kind: RealWgpuSurfaceTargetBootstrapErrorKind,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RealWgpuSurfaceTargetBootstrapErrorKind {
    SurfaceConfiguration,
    AdapterUnavailable,
    DeviceRequest,
}

impl Display for RealWgpuSurfaceTargetBootstrapError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for RealWgpuSurfaceTargetBootstrapError {}

pub async fn create_real_wgpu_surface_target(
    instance: &wgpu::Instance,
    surface: &wgpu::Surface<'_>,
    request: &RealWgpuSurfaceTargetBootstrapRequest<'_>,
) -> Result<RealWgpuSurfaceTargetBootstrap, RealWgpuSurfaceTargetBootstrapError> {
    let surface_request = WgpuNativeSurfaceConfigRequest::from_backend_config(
        request.width,
        request.height,
        &request.backend_config,
    )
    .map_err(surface_config_error)?;
    let adapter = select_surface_adapter(instance, surface, &surface_request, request).await?;
    let adapter_info = adapter.get_info();
    let (device, queue) = adapter
        .request_device(&request.device_descriptor)
        .await
        .map_err(|error| {
            bootstrap_error(
                RealWgpuSurfaceTargetBootstrapErrorKind::DeviceRequest,
                format!(
                    "failed to request native real-wgpu device for adapter \"{}\": {error}",
                    adapter_info.name
                ),
            )
        })?;
    let surface_config =
        configure_wgpu_surface_for_native_renderer(surface, &adapter, &device, &surface_request)
            .map_err(surface_config_error)?;
    let target = RealWgpuNativeRenderRuntimeTarget::new(
        device,
        queue,
        surface_config.config.format,
        wgpu::Extent3d {
            width: surface_config.config.width,
            height: surface_config.config.height,
            depth_or_array_layers: 1,
        },
    );

    Ok(RealWgpuSurfaceTargetBootstrap {
        adapter,
        adapter_info,
        surface_config,
        target,
    })
}

async fn select_surface_adapter(
    instance: &wgpu::Instance,
    surface: &wgpu::Surface<'_>,
    surface_request: &WgpuNativeSurfaceConfigRequest,
    request: &RealWgpuSurfaceTargetBootstrapRequest<'_>,
) -> Result<wgpu::Adapter, RealWgpuSurfaceTargetBootstrapError> {
    if let Some(adapter_name) = configured_adapter_name(&request.backend_config) {
        return select_named_surface_adapter(instance, surface, surface_request, adapter_name)
            .await;
    }

    instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: request.power_preference,
            force_fallback_adapter: request.force_fallback_adapter,
            compatible_surface: Some(surface),
        })
        .await
        .map_err(|error| {
            bootstrap_error(
                RealWgpuSurfaceTargetBootstrapErrorKind::AdapterUnavailable,
                format!("failed to request native real-wgpu adapter for surface: {error}"),
            )
        })
}

async fn select_named_surface_adapter(
    instance: &wgpu::Instance,
    surface: &wgpu::Surface<'_>,
    surface_request: &WgpuNativeSurfaceConfigRequest,
    adapter_name: &str,
) -> Result<wgpu::Adapter, RealWgpuSurfaceTargetBootstrapError> {
    let mut matched_incompatible = Vec::new();
    for adapter in instance.enumerate_adapters(wgpu::Backends::all()).await {
        let info = adapter.get_info();
        if !adapter_name_matches(&info.name, adapter_name) {
            continue;
        }
        let capabilities = surface.get_capabilities(&adapter);
        match plan_wgpu_surface_configuration(&capabilities, surface_request) {
            Ok(_) => return Ok(adapter),
            Err(error) => matched_incompatible.push(format!("{}: {}", info.name, error)),
        }
    }

    let detail = if matched_incompatible.is_empty() {
        format!("no adapter matched configured name \"{adapter_name}\"")
    } else {
        format!(
            "configured adapter \"{adapter_name}\" matched only incompatible surface adapters: {}",
            matched_incompatible.join("; ")
        )
    };
    Err(bootstrap_error(
        RealWgpuSurfaceTargetBootstrapErrorKind::AdapterUnavailable,
        detail,
    ))
}

fn configured_adapter_name(config: &WgpuNativeRenderBackendConfig) -> Option<&str> {
    config
        .adapter_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

fn adapter_name_matches(actual: &str, requested: &str) -> bool {
    let actual = actual.trim();
    let requested = requested.trim();
    actual.eq_ignore_ascii_case(requested)
        || actual
            .to_ascii_lowercase()
            .contains(&requested.to_ascii_lowercase())
}

fn surface_config_error(
    error: WgpuNativeSurfaceConfigError,
) -> RealWgpuSurfaceTargetBootstrapError {
    bootstrap_error(
        RealWgpuSurfaceTargetBootstrapErrorKind::SurfaceConfiguration,
        error.to_string(),
    )
}

fn bootstrap_error(
    kind: RealWgpuSurfaceTargetBootstrapErrorKind,
    message: impl Into<String>,
) -> RealWgpuSurfaceTargetBootstrapError {
    RealWgpuSurfaceTargetBootstrapError {
        kind,
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::backend::wgpu::WgpuPresentMode;
    use crate::renderer::backend::NativeRenderBackendResourcePolicy;

    #[test]
    fn configured_adapter_name_ignores_empty_values() {
        let config = WgpuNativeRenderBackendConfig {
            adapter_name: Some("  ".to_string()),
            surface_format: None,
            present_mode: WgpuPresentMode::Fifo,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        };

        assert_eq!(configured_adapter_name(&config), None);
    }

    #[test]
    fn adapter_name_matching_supports_exact_and_substring_matches() {
        assert!(adapter_name_matches("Apple M2 Pro", "apple m2 pro"));
        assert!(adapter_name_matches("NVIDIA GeForce RTX", "geforce"));
        assert!(!adapter_name_matches(
            "Microsoft Basic Render Driver",
            "geforce"
        ));
    }
}
