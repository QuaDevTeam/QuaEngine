use std::fmt::{Display, Formatter};

use quajs_native_runtime::{NativeHostApi, NativeHostApiError};
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderBackendError,
    NativeRenderer, NativeRendererFrameResult, NativeRendererJsonFrameError,
};
use quajs_wgpu_renderer::stage_layout::ResolvedStageLayout;

use super::cleanup::{sync_texture_releases_from_host_cleanup, NativeTextureHostCleanupSyncReport};
use super::host::sync_pending_texture_uploads_from_host;
use super::lifecycle::{
    sync_mounted_texture_bundle_lifecycle_from_host, NativeTextureBundleLifecycleSyncReport,
    NativeTextureBundleMountRegistry,
};
use super::types::{NativeTextureUploadHostSyncReport, NativeTextureUploadSink};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureSyncedFrameResult {
    pub frame: NativeRendererFrameResult,
    pub texture_host_cleanup_report: NativeTextureHostCleanupSyncReport,
    pub texture_upload_report: NativeTextureUploadHostSyncReport,
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
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeTextureJsonLifecycleFrameError {
    Json(NativeRendererJsonFrameError),
    Host(NativeHostApiError),
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
    let initial = NativeRendererFrameResult {
        update,
        submission,
        texture_upload_sync,
    };
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
        resubmitted_after_texture_upload: true,
    })
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
