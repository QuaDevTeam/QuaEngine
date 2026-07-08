use std::fmt::{Display, Formatter};

use quajs_native_runtime::{NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::fonts::{NativeFontBackend, NativeFontBackendError};
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderBackendError,
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
    NativeRendererJsonFrameError,
};
use quajs_wgpu_renderer::stage_layout::ResolvedStageLayout;
use quajs_wgpu_renderer::video::{NativeVideoBackend, NativeVideoBackendError};

use crate::audio_sync::{sync_audio_assets_from_host, NativeAudioAssetHostSyncReport};
use crate::font_sync::{sync_font_assets_from_host, NativeFontAssetHostSyncReport};
use crate::video_sync::{sync_video_assets_from_host, NativeVideoAssetHostSyncReport};

use super::cleanup::{sync_texture_releases_from_host_cleanup, NativeTextureHostCleanupSyncReport};
use super::host::sync_pending_texture_uploads_from_host;
use super::lifecycle::{
    sync_mounted_texture_bundle_lifecycle_from_host,
    sync_mounted_texture_bundle_lifecycle_from_host_and_media_teardown,
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
    pub video_asset_report: Option<NativeVideoAssetHostSyncReport>,
    pub font_asset_report: Option<NativeFontAssetHostSyncReport>,
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
    Video(NativeVideoBackendError),
    Font(NativeFontBackendError),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeTextureJsonLifecycleFrameError {
    Json(NativeRendererJsonFrameError),
    Host(NativeHostApiError),
    Audio(NativeAudioBackendError),
    Video(NativeVideoBackendError),
    Font(NativeFontBackendError),
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
                "Native texture bundle lifecycle media backend sync failed for audio backend: {error}"
            ),
            Self::Video(error) => write!(
                formatter,
                "Native texture bundle lifecycle media backend sync failed for video backend: {error}"
            ),
            Self::Font(error) => write!(
                formatter,
                "Native texture bundle lifecycle media backend sync failed for font backend: {error}"
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
                "Native texture bundle lifecycle media backend sync failed for audio backend: {error}"
            ),
            Self::Video(error) => write!(
                formatter,
                "Native texture bundle lifecycle media backend sync failed for video backend: {error}"
            ),
            Self::Font(error) => write!(
                formatter,
                "Native texture bundle lifecycle media backend sync failed for font backend: {error}"
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

impl From<NativeVideoBackendError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeVideoBackendError) -> Self {
        Self::Video(error)
    }
}

impl From<NativeFontBackendError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeFontBackendError) -> Self {
        Self::Font(error)
    }
}

impl From<NativeRendererFrameError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeRendererFrameError) -> Self {
        match error {
            NativeRendererFrameError::Render(error) => Self::Render(error),
            NativeRendererFrameError::Audio(error) => Self::Audio(error),
            NativeRendererFrameError::Video(error) => Self::Video(error),
            NativeRendererFrameError::Font(error) => Self::Font(error),
        }
    }
}

impl From<NativeTextureBundleLifecycleSyncError> for NativeTextureLifecycleFrameError {
    fn from(error: NativeTextureBundleLifecycleSyncError) -> Self {
        match error {
            NativeTextureBundleLifecycleSyncError::Host(error) => Self::Host(error),
            NativeTextureBundleLifecycleSyncError::Audio(error) => Self::Audio(error),
            NativeTextureBundleLifecycleSyncError::Video(error) => Self::Video(error),
            NativeTextureBundleLifecycleSyncError::Font(error) => Self::Font(error),
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
            NativeTextureLifecycleFrameError::Video(error) => Self::Video(error),
            NativeTextureLifecycleFrameError::Font(error) => Self::Font(error),
        }
    }
}

pub fn render_frame_with_host_texture_sync<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
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
        None,
        None,
    )
}

#[allow(dead_code)]
pub fn render_frame_with_host_texture_lifecycle_sync<B, A, V, F, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A, V, F>,
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
pub fn render_frame_with_host_texture_lifecycle_sync_and_media_teardown<B, A, V, F, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
    F: NativeFontBackend,
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
    let video_asset_report = match sync_video_assets_for_backend_if_needed(
        renderer,
        host,
        &update.video_backend_commands,
    ) {
        Ok(report) => report,
        Err(error) => {
            *renderer.state_mut() = previous_state;
            return Err(error.into());
        }
    };
    if let Err(error) = renderer.apply_video_update(&update) {
        *renderer.state_mut() = previous_state;
        return Err(error.into());
    }
    let font_asset_report =
        match sync_font_assets_for_backend_if_needed(renderer, host, &update.font_backend_commands)
        {
            Ok(report) => report,
            Err(error) => {
                *renderer.state_mut() = previous_state;
                return Err(error.into());
            }
        };
    if let Err(error) = renderer.apply_font_update(&update) {
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
        video_asset_report,
        font_asset_report,
    )?;
    let bundle_lifecycle_report =
        sync_mounted_texture_bundle_lifecycle_from_host_and_media_teardown(
            registry, renderer, host,
        )?;

    Ok(NativeTextureLifecycleSyncedFrameResult {
        frame,
        bundle_lifecycle_report,
    })
}

#[allow(dead_code)]
pub fn render_json_frame_with_host_texture_sync<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
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
pub fn render_json_frame_with_host_texture_lifecycle_sync<B, A, V, F, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A, V, F>,
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

pub fn render_json_frame_with_host_texture_lifecycle_sync_and_media_teardown<B, A, V, F, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    input: &str,
) -> Result<NativeTextureLifecycleSyncedFrameResult, NativeTextureJsonLifecycleFrameError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
    F: NativeFontBackend,
    H: NativeHostApi,
{
    let input = parse_native_renderer_json_frame_input(input)?;
    Ok(
        render_frame_with_host_texture_lifecycle_sync_and_media_teardown(
            registry,
            renderer,
            host,
            input.resolved_layout(),
            &input.view,
        )?,
    )
}

fn finish_texture_synced_frame<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    initial: NativeRendererFrameResult,
    texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    audio_asset_report: Option<NativeAudioAssetHostSyncReport>,
    video_asset_report: Option<NativeVideoAssetHostSyncReport>,
    font_asset_report: Option<NativeFontAssetHostSyncReport>,
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
            video_asset_report,
            font_asset_report,
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
        video_asset_report,
        font_asset_report,
        resubmitted_after_texture_upload: true,
    })
}

fn sync_audio_assets_for_backend_if_needed<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
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

fn sync_video_assets_for_backend_if_needed<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    plan: &quajs_wgpu_renderer::video::VideoBackendCommandPlan,
) -> Result<Option<NativeVideoAssetHostSyncReport>, NativeVideoBackendError>
where
    B: NativeRenderBackend,
    V: NativeVideoBackend,
    H: NativeHostApi,
{
    let wants_asset_loads = renderer
        .video_backend()
        .map(NativeVideoBackend::wants_video_asset_loads)
        .unwrap_or(false);
    if !wants_asset_loads {
        return Ok(None);
    }

    let report = sync_video_assets_from_host(host, plan);
    if !report.is_ok() {
        return Err(NativeVideoBackendError::backend_rejected(
            video_asset_sync_failure_message(&report),
        ));
    }
    let backend_loads = report.backend_asset_loads();
    if let Some(video_backend) = renderer.video_backend_mut() {
        video_backend.apply_video_asset_loads(&backend_loads)?;
    }

    Ok(Some(report))
}

fn sync_font_assets_for_backend_if_needed<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    plan: &quajs_wgpu_renderer::fonts::FontBackendCommandPlan,
) -> Result<Option<NativeFontAssetHostSyncReport>, NativeFontBackendError>
where
    B: NativeRenderBackend,
    F: NativeFontBackend,
    H: NativeHostApi,
{
    let wants_asset_loads = renderer
        .font_backend()
        .map(NativeFontBackend::wants_font_asset_loads)
        .unwrap_or(false);
    if !wants_asset_loads {
        return Ok(None);
    }

    let report = sync_font_assets_from_host(host, plan);
    if !report.is_ok() {
        return Err(NativeFontBackendError::backend_rejected(
            font_asset_sync_failure_message(&report),
        ));
    }
    let backend_loads = report.backend_asset_loads();
    if let Some(font_backend) = renderer.font_backend_mut() {
        font_backend.apply_font_asset_loads(&backend_loads)?;
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

fn font_asset_sync_failure_message(report: &NativeFontAssetHostSyncReport) -> String {
    let Some(failure) = report.failures.first() else {
        return "Native font asset sync failed.".to_string();
    };
    let face = failure.face_id.as_deref().unwrap_or("unknown");
    let asset = failure.asset_name.as_deref().unwrap_or("unknown");
    format!(
        "Native font asset sync failed for face \"{face}\" asset \"{asset}\": {}",
        failure.message
    )
}

fn video_asset_sync_failure_message(report: &NativeVideoAssetHostSyncReport) -> String {
    let Some(failure) = report.failures.first() else {
        return "Native video asset sync failed.".to_string();
    };
    let stream = failure.stream_id.as_deref().unwrap_or("unknown");
    let asset = failure.asset_name.as_deref().unwrap_or("unknown");
    format!(
        "Native video asset sync failed for stream \"{stream}\" asset \"{asset}\": {}",
        failure.message
    )
}
