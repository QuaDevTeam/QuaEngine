mod renderer_manifest;
mod runtime_manifest;

use quajs_native_runtime::{
    current_platform, current_profile, quickjs_runtime_version, NativeHostInfo,
    NativeHostInfoBuilder, NativePlatform, NativeProfile, RendererCapability,
};
#[cfg(all(feature = "native-window", feature = "native-audio-rodio"))]
use quajs_wgpu_renderer::native_wgpu_audio_playback_capability;
use quajs_wgpu_renderer::native_wgpu_capabilities;

use renderer_manifest::validate_manifest_renderer_against_host;
use runtime_manifest::validate_manifest_runtime_against_host;

use crate::target_bundle::{
    validate_native_target_bundle_manifest, NativeStartupError, NativeStartupManifestExpectation,
    NativeTargetBundleManifest,
};

pub const DEFAULT_APP_NAME: &str = "QuaNativeApp";
pub const DEFAULT_BUNDLE_ID: &str = "dev.qua.native";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeAppConfig {
    pub name: String,
    pub bundle_id: String,
    pub version: String,
    pub build_number: String,
}

impl NativeAppConfig {
    pub fn new(
        name: impl Into<String>,
        bundle_id: impl Into<String>,
        version: impl Into<String>,
        build_number: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            bundle_id: bundle_id.into(),
            version: version.into(),
            build_number: build_number.into(),
        }
    }
}

pub fn compile_time_native_app_config() -> NativeAppConfig {
    NativeAppConfig::new(
        option_env!("QUA_NATIVE_APP_NAME").unwrap_or(DEFAULT_APP_NAME),
        option_env!("QUA_NATIVE_BUNDLE_ID").unwrap_or(DEFAULT_BUNDLE_ID),
        option_env!("QUA_NATIVE_APP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")),
        option_env!("QUA_NATIVE_BUILD_NUMBER").unwrap_or("dev"),
    )
}

pub fn create_native_startup_host_info(
    config: NativeAppConfig,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
) -> Result<NativeHostInfo, NativeStartupError> {
    create_native_startup_host_info_with(config, target_bundle_manifest, create_host_info)
}

fn create_host_info(config: NativeAppConfig) -> NativeHostInfo {
    NativeHostInfoBuilder::new(config.name, config.bundle_id)
        .app_version(config.version)
        .build_number(config.build_number)
        .renderer_version(env!("CARGO_PKG_VERSION"))
        .quickjs_version(quickjs_runtime_version())
        .native_runtime_version(env!("CARGO_PKG_VERSION"))
        .asset_adapter_version(env!("CARGO_PKG_VERSION"))
        .store_adapter_version(env!("CARGO_PKG_VERSION"))
        .capabilities(native_startup_renderer_capabilities())
        .build()
}

pub(crate) fn native_startup_renderer_capabilities() -> Vec<RendererCapability> {
    append_native_startup_feature_capabilities(native_wgpu_capabilities())
}

#[cfg(all(feature = "native-window", feature = "native-audio-rodio"))]
fn append_native_startup_feature_capabilities(
    mut capabilities: Vec<RendererCapability>,
) -> Vec<RendererCapability> {
    capabilities.push(native_wgpu_audio_playback_capability());
    capabilities
}

#[cfg(not(all(feature = "native-window", feature = "native-audio-rodio")))]
fn append_native_startup_feature_capabilities(
    capabilities: Vec<RendererCapability>,
) -> Vec<RendererCapability> {
    capabilities
}

fn create_native_startup_host_info_with<F>(
    config: NativeAppConfig,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
    create: F,
) -> Result<NativeHostInfo, NativeStartupError>
where
    F: FnOnce(NativeAppConfig) -> NativeHostInfo,
{
    if let Some(manifest) = target_bundle_manifest {
        validate_native_target_bundle_manifest(manifest, Some(&manifest_expectation(&config)))?;
    }

    let host_info = create(config);
    if let Some(manifest) = target_bundle_manifest {
        validate_manifest_renderer_against_host(manifest, &host_info)?;
        validate_manifest_runtime_against_host(manifest, &host_info)?;
    }

    Ok(host_info)
}

fn manifest_expectation(config: &NativeAppConfig) -> NativeStartupManifestExpectation {
    NativeStartupManifestExpectation {
        bundle_id: config.bundle_id.clone(),
        version: config.version.clone(),
        build_number: config.build_number.clone(),
        profile: profile_manifest_value(current_profile()).to_string(),
        platform: platform_manifest_value(current_platform()).to_string(),
    }
}

pub(crate) fn profile_manifest_value(profile: NativeProfile) -> &'static str {
    match profile {
        NativeProfile::Debug => "debug",
        NativeProfile::Release => "release",
    }
}

pub(crate) fn platform_manifest_value(platform: NativePlatform) -> &'static str {
    match platform {
        NativePlatform::MacOs => "macos",
        NativePlatform::Windows => "windows",
        NativePlatform::Linux => "linux",
    }
}

#[cfg(test)]
mod tests;
