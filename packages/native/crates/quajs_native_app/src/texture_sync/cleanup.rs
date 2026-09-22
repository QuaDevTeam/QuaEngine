use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};

use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::fonts::{NativeFontBackend, NativeFontBackendError};
use quajs_wgpu_renderer::renderer::NativeRendererHostCleanupRecord;
use quajs_wgpu_renderer::renderer::{
    NativeRenderBackend, NativeRenderer, NativeRendererMediaBackendError,
    NativeRendererPackageRelease,
};
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};
use quajs_wgpu_renderer::video::{NativeVideoBackend, NativeVideoBackendError};

use super::frame::{sync_font_atlas_textures_for_backend, sync_video_frame_textures_for_backend};
use super::types::{
    NativeFontAtlasTextureSyncReport, NativeTextureUploadSink, NativeVideoFrameTextureSyncReport,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureHostCleanupSyncReport {
    pub cleanup_record_count: usize,
    pub texture_release_candidate_count: usize,
    pub released_count: usize,
    pub retained_count: usize,
    pub missing_count: usize,
    pub ignored_count: usize,
    pub release_error_count: usize,
    pub released_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub ignored_resource_ids: Vec<ResourceId>,
    pub release_failures: Vec<NativeTextureHostCleanupSyncFailure>,
}

impl NativeTextureHostCleanupSyncReport {
    #[allow(dead_code)]
    pub fn is_ok(&self) -> bool {
        self.release_failures.is_empty()
    }

    #[allow(dead_code)]
    fn record_failure(&mut self, failure: NativeTextureHostCleanupSyncFailure) {
        self.release_error_count += 1;
        self.release_failures.push(failure);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeTextureHostCleanupSyncFailure {
    pub resource_id: ResourceId,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureCleanedPackageReleaseResult {
    pub package_release: NativeRendererPackageRelease,
    pub texture_cleanup_report: NativeTextureHostCleanupSyncReport,
    pub video_frame_texture_report: Option<NativeVideoFrameTextureSyncReport>,
    pub font_atlas_report: Option<NativeFontAtlasTextureSyncReport>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureCleanedClearResult {
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub texture_cleanup_report: NativeTextureHostCleanupSyncReport,
    pub video_frame_texture_report: Option<NativeVideoFrameTextureSyncReport>,
    pub font_atlas_report: Option<NativeFontAtlasTextureSyncReport>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeTextureMediaTeardownError {
    Audio(NativeAudioBackendError),
    Video(NativeVideoBackendError),
    Font(NativeFontBackendError),
}

impl Display for NativeTextureMediaTeardownError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Audio(error) => write!(
                formatter,
                "Native texture media teardown failed for audio backend: {error}"
            ),
            Self::Video(error) => write!(
                formatter,
                "Native texture media teardown failed for video backend: {error}"
            ),
            Self::Font(error) => write!(
                formatter,
                "Native texture media teardown failed for font backend: {error}"
            ),
        }
    }
}

impl std::error::Error for NativeTextureMediaTeardownError {}

impl From<NativeAudioBackendError> for NativeTextureMediaTeardownError {
    fn from(error: NativeAudioBackendError) -> Self {
        Self::Audio(error)
    }
}

impl From<NativeVideoBackendError> for NativeTextureMediaTeardownError {
    fn from(error: NativeVideoBackendError) -> Self {
        Self::Video(error)
    }
}

impl From<NativeFontBackendError> for NativeTextureMediaTeardownError {
    fn from(error: NativeFontBackendError) -> Self {
        Self::Font(error)
    }
}

impl From<NativeRendererMediaBackendError> for NativeTextureMediaTeardownError {
    fn from(error: NativeRendererMediaBackendError) -> Self {
        match error {
            NativeRendererMediaBackendError::Audio(error) => Self::Audio(error),
            NativeRendererMediaBackendError::Video(error) => Self::Video(error),
            NativeRendererMediaBackendError::Font(error) => Self::Font(error),
        }
    }
}

pub fn sync_texture_releases_from_host_cleanup<S>(
    sink: &mut S,
    cleanup: &[NativeRendererHostCleanupRecord],
) -> NativeTextureHostCleanupSyncReport
where
    S: NativeTextureUploadSink,
{
    sync_texture_cleanup(sink, cleanup, &Default::default(), false)
}

pub(super) fn sync_frame_texture_releases<S: NativeTextureUploadSink>(
    sink: &mut S,
    update: &quajs_wgpu_renderer::renderer::NativeRendererFrameUpdate,
) -> NativeTextureHostCleanupSyncReport {
    let active: BTreeSet<String> = update
        .texture_uploads
        .requests
        .iter()
        .map(|request| request.resource_id.as_str().to_string())
        .collect();
    sink.touch_texture_resources(&active);
    for request in &update.texture_uploads.requests {
        sink.prepare_texture_request(request);
    }
    sync_texture_cleanup(sink, &update.host_cleanup, &active, true)
}

fn sync_texture_cleanup<S: NativeTextureUploadSink>(
    sink: &mut S,
    cleanup: &[NativeRendererHostCleanupRecord],
    active: &BTreeSet<String>,
    retire: bool,
) -> NativeTextureHostCleanupSyncReport {
    let mut report = NativeTextureHostCleanupSyncReport {
        cleanup_record_count: cleanup.len(),
        ..Default::default()
    };

    for record in cleanup {
        if !is_texture_cleanup_kind(record.kind) {
            report.ignored_count += 1;
            report.ignored_resource_ids.push(record.resource_id.clone());
            continue;
        }

        report.texture_release_candidate_count += 1;
        let result = if retire && !active.contains(record.resource_id.as_str()) {
            sink.retire_texture_resource(&record.resource_id)
        } else {
            sink.release_texture_resource(&record.resource_id)
        };
        match result {
            Ok(true) => {
                report.released_count += 1;
                report
                    .released_resource_ids
                    .push(record.resource_id.clone());
            }
            Ok(false) if retire && sink.texture_is_resident(&record.resource_id) => {
                report.retained_count += 1;
            }
            Ok(false) => {
                report.missing_count += 1;
                report.missing_resource_ids.push(record.resource_id.clone());
            }
            Err(error) => {
                report.record_failure(NativeTextureHostCleanupSyncFailure {
                    resource_id: record.resource_id.clone(),
                    message: error.to_string(),
                });
            }
        }
    }

    report
}

#[allow(dead_code)]
pub fn release_package_resources_with_host_texture_cleanup<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    package_id: &str,
) -> NativeTextureCleanedPackageReleaseResult
where
    B: NativeRenderBackend + NativeTextureUploadSink,
{
    let package_release = renderer.release_package_resources(package_id);
    let texture_cleanup_report = sync_texture_releases_from_host_cleanup(
        renderer.backend_mut(),
        &package_release.host_cleanup,
    );
    restore_failed_texture_cleanup_resources(renderer, &package_release, &texture_cleanup_report);
    if package_release.summary.blocked_count == 0 && texture_cleanup_report.is_ok() {
        renderer
            .backend_mut()
            .release_cached_package_textures(package_id);
    }

    NativeTextureCleanedPackageReleaseResult {
        package_release,
        texture_cleanup_report,
        video_frame_texture_report: None,
        font_atlas_report: None,
    }
}

#[allow(dead_code)]
pub fn release_package_resources_with_host_texture_cleanup_and_media_teardown<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    package_id: &str,
) -> Result<NativeTextureCleanedPackageReleaseResult, NativeTextureMediaTeardownError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
    F: NativeFontBackend,
{
    let package_release =
        renderer.release_package_resources_and_apply_media_teardown(package_id)?;
    let texture_cleanup_report = sync_texture_releases_from_host_cleanup(
        renderer.backend_mut(),
        &package_release.host_cleanup,
    );
    restore_failed_texture_cleanup_resources(renderer, &package_release, &texture_cleanup_report);
    if package_release.summary.blocked_count == 0 && texture_cleanup_report.is_ok() {
        renderer
            .backend_mut()
            .release_cached_package_textures(package_id);
    }
    let video_frame_texture_report = sync_video_frame_textures_for_backend(renderer);
    let font_atlas_report = sync_font_atlas_textures_for_backend(renderer);

    Ok(NativeTextureCleanedPackageReleaseResult {
        package_release,
        texture_cleanup_report,
        video_frame_texture_report: Some(video_frame_texture_report),
        font_atlas_report: Some(font_atlas_report),
    })
}

#[allow(dead_code)]
pub fn clear_renderer_with_host_texture_cleanup<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
) -> NativeTextureCleanedClearResult
where
    B: NativeRenderBackend + NativeTextureUploadSink,
{
    let (released_resources, host_cleanup) = renderer.clear_with_host_cleanup();
    let texture_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &host_cleanup);

    renderer.backend_mut().clear_cached_textures();
    NativeTextureCleanedClearResult {
        released_resources,
        host_cleanup,
        texture_cleanup_report,
        video_frame_texture_report: None,
        font_atlas_report: None,
    }
}

#[allow(dead_code)]
pub fn clear_renderer_with_host_texture_cleanup_and_media_teardown<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
) -> Result<NativeTextureCleanedClearResult, NativeTextureMediaTeardownError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
    F: NativeFontBackend,
{
    let (released_resources, host_cleanup) =
        renderer.clear_with_host_cleanup_and_media_teardown()?;
    let texture_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &host_cleanup);
    let video_frame_texture_report = sync_video_frame_textures_for_backend(renderer);
    let font_atlas_report = sync_font_atlas_textures_for_backend(renderer);

    renderer.backend_mut().clear_cached_textures();
    Ok(NativeTextureCleanedClearResult {
        released_resources,
        host_cleanup,
        texture_cleanup_report,
        video_frame_texture_report: Some(video_frame_texture_report),
        font_atlas_report: Some(font_atlas_report),
    })
}

#[allow(dead_code)]
fn is_texture_cleanup_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::Texture | NativeResourceKind::DecodedImage
    )
}

fn restore_failed_texture_cleanup_resources<B, A, V, F>(
    renderer: &mut NativeRenderer<B, A, V, F>,
    package_release: &NativeRendererPackageRelease,
    texture_cleanup_report: &NativeTextureHostCleanupSyncReport,
) where
    B: NativeRenderBackend,
{
    if texture_cleanup_report.release_failures.is_empty() {
        return;
    }

    let failed_resource_ids = texture_cleanup_report
        .release_failures
        .iter()
        .map(|failure| failure.resource_id.clone())
        .collect::<BTreeSet<_>>();

    for record in &package_release.released_resources {
        if failed_resource_ids.contains(&record.id) {
            renderer.state_mut().resources_mut().insert(record.clone());
        }
    }
}
