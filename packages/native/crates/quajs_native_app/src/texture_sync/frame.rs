use std::fmt::{Display, Formatter};

use quajs_native_runtime::{NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::fonts::{
    FontBackendAtlasTexture, NativeFontBackend, NativeFontBackendError,
};
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderBackendError,
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult, NativeRendererFrameUpdate,
    NativeRendererJsonFrameError,
};
use quajs_wgpu_renderer::resources::ResourceId;
use quajs_wgpu_renderer::stage_layout::ResolvedStageLayout;
use quajs_wgpu_renderer::video::{
    NativeVideoBackend, NativeVideoBackendError, VideoBackendFrameTexture,
};

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
use super::types::{
    NativeFontAtlasTextureSyncFailure, NativeFontAtlasTextureSyncFailureKind,
    NativeFontAtlasTextureSyncReport, NativeTextureReleaseHostSyncFailure,
    NativeTextureUploadHostSyncReport, NativeTextureUploadMetadata, NativeTextureUploadSink,
    NativeVideoFrameTextureSyncFailure, NativeVideoFrameTextureSyncFailureKind,
    NativeVideoFrameTextureSyncReport,
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureSyncedFrameResult {
    pub frame: NativeRendererFrameResult,
    pub texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    pub texture_upload_report: NativeTextureUploadHostSyncReport,
    pub audio_asset_report: Option<NativeAudioAssetHostSyncReport>,
    pub video_asset_report: Option<NativeVideoAssetHostSyncReport>,
    pub font_asset_report: Option<NativeFontAssetHostSyncReport>,
    pub video_frame_texture_report: Option<NativeVideoFrameTextureSyncReport>,
    pub font_atlas_report: Option<NativeFontAtlasTextureSyncReport>,
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
        None,
        None,
        false,
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
    let video_frame_texture_report = sync_video_frame_textures_for_backend(renderer);
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
    if let Err(error) = renderer.prepare_font_frame_text() {
        *renderer.state_mut() = previous_state;
        return Err(error.into());
    }
    let font_atlas_report = sync_font_atlas_textures_for_backend(renderer);
    let text_reflowed = renderer.reflow_text(view);

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
        Some(video_frame_texture_report),
        Some(font_atlas_report),
        text_reflowed,
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

pub(crate) fn render_cached_frame_with_media_texture_sync<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    update: NativeRendererFrameUpdate,
) -> Result<NativeTextureSyncedFrameResult, NativeRenderBackendError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    V: NativeVideoBackend,
    F: NativeFontBackend,
{
    let video_frame_texture_report = sync_video_frame_textures_for_backend(renderer);
    let font_atlas_report = sync_font_atlas_textures_for_backend(renderer);
    let submission = renderer.render_frame()?;
    let texture_upload_sync = renderer.texture_upload_sync_for_update(&update);

    Ok(NativeTextureSyncedFrameResult {
        frame: NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        },
        texture_host_cleanup_report: NativeTextureHostCleanupSyncReport::default(),
        texture_upload_report: NativeTextureUploadHostSyncReport::default(),
        audio_asset_report: None,
        video_asset_report: None,
        font_asset_report: None,
        video_frame_texture_report: Some(video_frame_texture_report),
        font_atlas_report: Some(font_atlas_report),
        resubmitted_after_texture_upload: false,
    })
}

fn finish_texture_synced_frame<B, A, V, F, H>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    host: &H,
    initial: NativeRendererFrameResult,
    texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    audio_asset_report: Option<NativeAudioAssetHostSyncReport>,
    video_asset_report: Option<NativeVideoAssetHostSyncReport>,
    font_asset_report: Option<NativeFontAssetHostSyncReport>,
    video_frame_texture_report: Option<NativeVideoFrameTextureSyncReport>,
    font_atlas_report: Option<NativeFontAtlasTextureSyncReport>,
    text_reflowed: bool,
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
    let font_atlas_uploaded = font_atlas_report
        .as_ref()
        .map(|report| report.uploaded_count > 0)
        .unwrap_or(false);
    let video_frame_texture_uploaded = video_frame_texture_report
        .as_ref()
        .map(|report| report.uploaded_count > 0)
        .unwrap_or(false);

    if texture_upload_report.uploaded_count == 0
        && !font_atlas_uploaded
        && !video_frame_texture_uploaded
        && !text_reflowed
    {
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
            video_frame_texture_report,
            font_atlas_report,
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
        video_frame_texture_report,
        font_atlas_report,
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

pub(super) fn sync_font_atlas_textures_for_backend<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
) -> NativeFontAtlasTextureSyncReport
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    F: NativeFontBackend,
{
    let Some(font_backend) = renderer.font_backend_mut() else {
        return NativeFontAtlasTextureSyncReport::default();
    };
    let releases = font_backend.drain_font_atlas_texture_releases();
    let atlases = font_backend.drain_font_atlas_textures();
    let mut report = NativeFontAtlasTextureSyncReport {
        pending_upload_count: atlases.len(),
        release_candidate_count: releases.len(),
        ..Default::default()
    };

    for resource_id in releases {
        release_font_atlas_texture(renderer.backend_mut(), resource_id, &mut report);
    }
    for atlas in atlases {
        upload_font_atlas_texture(renderer.backend_mut(), atlas, &mut report);
    }

    report
}

pub(super) fn sync_video_frame_textures_for_backend<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
) -> NativeVideoFrameTextureSyncReport
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    V: NativeVideoBackend,
{
    let Some(video_backend) = renderer.video_backend_mut() else {
        return NativeVideoFrameTextureSyncReport::default();
    };
    let releases = video_backend.drain_video_frame_texture_releases();
    let frames = video_backend.drain_video_frame_textures();
    let mut report = NativeVideoFrameTextureSyncReport {
        pending_upload_count: frames.len(),
        release_candidate_count: releases.len(),
        ..Default::default()
    };

    for resource_id in releases {
        release_video_frame_texture(renderer.backend_mut(), resource_id, &mut report);
    }
    for frame in frames {
        upload_video_frame_texture(renderer.backend_mut(), frame, &mut report);
    }

    report
}

fn release_video_frame_texture<S>(
    sink: &mut S,
    resource_id: ResourceId,
    report: &mut NativeVideoFrameTextureSyncReport,
) where
    S: NativeTextureUploadSink,
{
    match sink.release_texture_resource(&resource_id) {
        Ok(true) => {
            report.released_count += 1;
            report.released_resource_ids.push(resource_id);
        }
        Ok(false) => {
            report.missing_release_count += 1;
            report.missing_release_resource_ids.push(resource_id);
        }
        Err(error) => {
            report.record_release_failure(NativeTextureReleaseHostSyncFailure {
                resource_id,
                message: error.to_string(),
            });
        }
    }
}

fn upload_video_frame_texture<S>(
    sink: &mut S,
    frame: VideoBackendFrameTexture,
    report: &mut NativeVideoFrameTextureSyncReport,
) where
    S: NativeTextureUploadSink,
{
    let expected_len = frame
        .width
        .checked_mul(frame.height)
        .and_then(|pixel_count| pixel_count.checked_mul(4))
        .map(|byte_len| byte_len as usize);
    if frame.width == 0
        || frame.height == 0
        || expected_len
            .map(|len| len != frame.rgba.len())
            .unwrap_or(true)
    {
        report.record_failure(NativeVideoFrameTextureSyncFailure {
            kind: NativeVideoFrameTextureSyncFailureKind::InvalidFrame,
            stream_id: frame.stream_id,
            resource_id: frame.resource_id,
            message: "Native video frame texture must contain positive RGBA8 dimensions and matching byte length.".to_string(),
        });
        return;
    }

    let metadata = NativeTextureUploadMetadata {
        owner_package_id: frame.owner_package_id,
        required_package_ids: frame.required_package_ids,
    };
    match sink.upload_decoded_texture_rgba8(
        &frame.resource_id,
        frame.width,
        frame.height,
        &frame.rgba,
        metadata,
    ) {
        Ok(()) => {
            report.uploaded_count += 1;
            report.uploaded_resource_ids.push(frame.resource_id);
        }
        Err(error) => {
            report.record_failure(NativeVideoFrameTextureSyncFailure {
                kind: NativeVideoFrameTextureSyncFailureKind::UploadError,
                stream_id: frame.stream_id,
                resource_id: frame.resource_id,
                message: error.to_string(),
            });
        }
    }
}

fn release_font_atlas_texture<S>(
    sink: &mut S,
    resource_id: ResourceId,
    report: &mut NativeFontAtlasTextureSyncReport,
) where
    S: NativeTextureUploadSink,
{
    sink.release_font_atlas_layout(&resource_id);
    match sink.release_texture_resource(&resource_id) {
        Ok(true) => {
            report.released_count += 1;
            report.released_resource_ids.push(resource_id);
        }
        Ok(false) => {
            report.missing_release_count += 1;
            report.missing_release_resource_ids.push(resource_id);
        }
        Err(error) => {
            report.record_release_failure(NativeTextureReleaseHostSyncFailure {
                resource_id,
                message: error.to_string(),
            });
        }
    }
}

fn upload_font_atlas_texture<S>(
    sink: &mut S,
    atlas: FontBackendAtlasTexture,
    report: &mut NativeFontAtlasTextureSyncReport,
) where
    S: NativeTextureUploadSink,
{
    let expected_len = atlas
        .width
        .checked_mul(atlas.height)
        .and_then(|pixel_count| pixel_count.checked_mul(4))
        .map(|byte_len| byte_len as usize);
    if atlas.width == 0
        || atlas.height == 0
        || expected_len
            .map(|len| len != atlas.rgba.len())
            .unwrap_or(true)
    {
        report.record_failure(NativeFontAtlasTextureSyncFailure {
            kind: NativeFontAtlasTextureSyncFailureKind::InvalidAtlas,
            resource_id: atlas.resource_id,
            message: "Native font atlas texture must contain positive RGBA8 dimensions and matching byte length.".to_string(),
        });
        return;
    }

    let layout = atlas.layout.clone();
    let metadata = NativeTextureUploadMetadata {
        owner_package_id: atlas.owner_package_id,
        required_package_ids: atlas.required_package_ids,
    };
    match sink.upload_decoded_texture_rgba8(
        &atlas.resource_id,
        atlas.width,
        atlas.height,
        &atlas.rgba,
        metadata,
    ) {
        Ok(()) => {
            if let Some(layout) = layout {
                sink.register_font_atlas_layout(layout);
            }
            report.uploaded_count += 1;
            report.uploaded_resource_ids.push(atlas.resource_id);
        }
        Err(error) => {
            report.record_failure(NativeFontAtlasTextureSyncFailure {
                kind: NativeFontAtlasTextureSyncFailureKind::UploadError,
                resource_id: atlas.resource_id,
                message: error.to_string(),
            });
        }
    }
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
