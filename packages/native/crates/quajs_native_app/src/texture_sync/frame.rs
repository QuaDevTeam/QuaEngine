use std::fmt::{Display, Formatter};

use quajs_native_runtime::{NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderBackendError,
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
    NativeRendererJsonFrameError,
};
use quajs_wgpu_renderer::stage_layout::ResolvedStageLayout;

use crate::audio_sync::{sync_audio_assets_from_host, NativeAudioAssetHostSyncReport};

use super::cleanup::{sync_texture_releases_from_host_cleanup, NativeTextureHostCleanupSyncReport};
use super::host::sync_pending_texture_uploads_from_host;
use super::lifecycle::{
    sync_mounted_texture_bundle_lifecycle_from_host,
    sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown,
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureBundleMountRegistry,
};
use super::types::{NativeTextureUploadHostSyncReport, NativeTextureUploadSink};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureSyncedFrameResult {
    pub frame: NativeRendererFrameResult,
    pub texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    pub texture_upload_report: NativeTextureUploadHostSyncReport,
    pub audio_asset_report: Option<NativeAudioAssetHostSyncReport>,
    pub resubmitted_after_texture_upload: bool,
}

#[derive(Clone, Debug, PartialEq)]
#[allow(dead_code)]
pub struct NativeTextureLifecycleSyncedFrameResult {
    pub frame: NativeTextureSyncedFrameResult,
    pub bundle_lifecycle_report: NativeTextureBundleLifecycleSyncReport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum NativeTextureLifecycleFrameError {
    Render(NativeRenderBackendError),
    Host(NativeHostApiError),
    Audio(NativeAudioBackendError),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeTextureJsonLifecycleFrameError {
    Json(NativeRendererJsonFrameError),
    Host(NativeHostApiError),
    Audio(NativeAudioBackendError),
}

impl Display for NativeTextureLifecycleFrameError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Render(error) => write!(formatter, "Native texture frame render failed: {error}"),
            Self::Host(error) => write!(
                formatter,
                "Native texture bundle lifecycle host sync failed: {}",
                error.message()
            ),
            Self::Audio(error) => write!(
                formatter,
                "Native texture bundle lifecycle audio teardown failed: {error}"
            ),
        }
    }
}

impl std::error::Error for NativeTextureLifecycleFrameError {}

impl Display for NativeTextureJsonLifecycleFrameError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "{error}"),
            Self::Host(error) => write!(
                formatter,
                "Native texture bundle lifecycle host sync failed: {}",
                error.message()
            ),
            Self::Audio(error) => write!(
                formatter,
                "Native texture bundle lifecycle audio teardown failed: {error}"
            ),
        }
    }
}

impl std::error::Error for NativeTextureJsonLifecycleFrameError {}

impl From<NativeRenderBackendError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeRenderBackendError) -> Self {
        Self::Render(error)
    }
}

impl From<NativeHostApiError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeHostApiError) -> Self {
        Self::Host(error)
    }
}

impl From<NativeAudioBackendError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeAudioBackendError) -> Self {
        Self::Audio(error)
    }
}

impl From<NativeRendererFrameError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeRendererFrameError) -> Self {
        match error {
            NativeRendererFrameError::Render(error) => Self::Render(error),
            NativeRendererFrameError::Audio(error) => Self::Audio(error),
        }
    }
}

impl From<NativeTextureBundleLifecycleSyncError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeTextureBundleLifecycleSyncError) -> Self {
        match error {
            NativeTextureBundleLifecycleSyncError::Host(error) => Self::Host(error),
            NativeTextureBundleLifecycleSyncError::Audio(error) => Self::Audio(error),
        }
    }
}

impl From<NativeRendererJsonFrameError> for NativeTextureJsonLifecycleFrameError {
    fn from(error: NativeRendererJsonFrameError) -> Self {
        Self::Json(error)
    }
}

impl From<NativeTextureLifecycleFrameError> for NativeTextureJsonLifecycleFrameError {
    fn from(error: NativeTextureLifecycleFrameError) -> Self {
        match error {
            NativeTextureLifecycleFrameError::Render(error) => {
                Self::Json(NativeRendererJsonFrameError::Render(error))
            }
            NativeTextureLifecycleFrameError::Host(error) => Self::Host(error),
            NativeTextureLifecycleFrameError::Audio(error) => Self::Audio(error),
        }
    }
}

pub fn render_frame_with_host_texture_sync<B, A, H>(
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> Result<NativeTextureSyncedFrameResult, NativeRenderBackendError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let update = renderer.prepare_frame(layout, view);
    let texture_host_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &update.host_cleanup);
    let submission = renderer.render_frame()?;
    let texture_upload_sync = renderer.texture_upload_sync_for_update(&update);
    finish_texture_synced_frame(
        renderer,
        host,
        NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        },
        texture_host_cleanup_report,
        None,
    )
}

#[allow(dead_code)]
pub fn render_frame_with_host_texture_lifecycle_sync<B, A, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let frame = render_frame_with_host_texture_sync(renderer, host, layout, view)?;
    let bundle_lifecycle_report =
        sync_mounted_texture_bundle_lifecycle_from_host(registry, renderer, host)?;

    Ok(NativeTextureLifecycleSyncedFrameResult {
        frame,
        bundle_lifecycle_report,
    })
}

#[allow(dead_code)]
pub fn render_frame_with_host_texture_lifecycle_sync_and_audio_teardown<B, A, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    H: NativeHostApi,
{
    let previous_state = renderer.state().clone();
    let update = renderer.prepare_frame(layout, view);
    let texture_host_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &update.host_cleanup);
    let submission = match renderer.render_frame() {
        Ok(submission) => submission,
        Err(error) => {
            *renderer.state_mut() = previous_state;
            return Err(error.into());
        }
    };
    let texture_upload_sync = renderer.texture_upload_sync_for_update(&update);
    let audio_asset_report = match sync_audio_assets_for_backend_if_needed(
        renderer,
        host,
        &update.audio_backend_commands,
    ) {
        Ok(report) => report,
        Err(error) => {
            *renderer.state_mut() = previous_state;
            return Err(error.into());
        }
    };
    if let Err(error) = renderer.apply_audio_update(&update) {
        *renderer.state_mut() = previous_state;
        return Err(error.into());
    }

    let frame = finish_texture_synced_frame(
        renderer,
        host,
        NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        },
        texture_host_cleanup_report,
        audio_asset_report,
    )?;
    let bundle_lifecycle_report =
        sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown(
            registry, renderer, host,
        )?;

    Ok(NativeTextureLifecycleSyncedFrameResult {
        frame,
        bundle_lifecycle_report,
    })
}

#[allow(dead_code)]
pub fn render_json_frame_with_host_texture_sync<B, A, H>(
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    input: &str,
) -> Result<NativeTextureSyncedFrameResult, NativeRendererJsonFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let input = parse_native_renderer_json_frame_input(input)?;
    Ok(render_frame_with_host_texture_sync(
        renderer,
        host,
        input.resolved_layout(),
        &input.view,
    )?)
}

#[allow(dead_code)]
pub fn render_json_frame_with_host_texture_lifecycle_sync<B, A, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    input: &str,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureJsonLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let input = parse_native_renderer_json_frame_input(input)?;
    Ok(render_frame_with_host_texture_lifecycle_sync(
        registry,
        renderer,
        host,
        input.resolved_layout(),
        &input.view,
    )?)
}

pub fn render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown<B, A, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    input: &str,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureJsonLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    H: NativeHostApi,
{
    let input = parse_native_renderer_json_frame_input(input)?;
    Ok(
        render_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
            registry,
            renderer,
            host,
            input.resolved_layout(),
            &input.view,
        )?,
    )
}

fn finish_texture_synced_frame<B, A, H>(
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    initial: NativeRendererFrameResult,
    texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    audio_asset_report: Option<NativeAudioAssetHostSyncReport>,
) -> Result<NativeTextureSyncedFrameResult, NativeRenderBackendError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let texture_upload_report = sync_pending_texture_uploads_from_host(
        host,
        renderer.backend_mut(),
        &initial.texture_upload_sync,
    );

    if texture_upload_report.uploaded_count == 0 {
        let mut frame = initial;
        if texture_upload_report.released_orphaned_count > 0 {
            frame.texture_upload_sync = renderer.texture_upload_sync_for_update(&frame.update);
        }
        return Ok(NativeTextureSyncedFrameResult {
            frame,
            texture_host_cleanup_report,
            texture_upload_report,
            audio_asset_report,
            resubmitted_after_texture_upload: false,
        });
    }

    let update = initial.update;
    let submission = renderer.render_frame()?;
    let texture_upload_sync = renderer.texture_upload_sync_for_update(&update);

    Ok(NativeTextureSyncedFrameResult {
        frame: NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        },
        texture_host_cleanup_report,
        texture_upload_report,
        audio_asset_report,
        resubmitted_after_texture_upload: true,
    })
}

fn sync_audio_assets_for_backend_if_needed<B, A, H>(
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
    plan: &quajs_wgpu_renderer::audio::AudioBackendCommandPlan,
) -> Result<Option<NativeAudioAssetHostSyncReport>, NativeAudioBackendError>
where
    B: NativeRenderBackend,
    A: NativeAudioBackend,
    H: NativeHostApi,
{
    let wants_asset_loads = renderer
        .audio_backend()
        .map(NativeAudioBackend::wants_audio_asset_loads)
        .unwrap_or(false);
    if !wants_asset_loads {
        return Ok(None);
    }

    let report = sync_audio_assets_from_host(host, plan);
    if !report.is_ok() {
        return Err(NativeAudioBackendError::backend_rejected(
            audio_asset_sync_failure_message(&report),
        ));
    }
    let backend_loads = report.backend_asset_loads();
    if let Some(audio_backend) = renderer.audio_backend_mut() {
        audio_backend.apply_audio_asset_loads(&backend_loads)?;
    }

    Ok(Some(report))
}

fn audio_asset_sync_failure_message(report: &NativeAudioAssetHostSyncReport) -> String {
    let Some(failure) = report.failures.first() else {
        return "Native audio asset sync failed.".to_string();
    };
    let track = failure.track_id.as_deref().unwrap_or("unknown");
    let asset = failure.asset_name.as_deref().unwrap_or("unknown");
    format!(
        "Native audio asset sync failed for track \"{track}\" asset \"{asset}\": {}",
        failure.message
    )
}
