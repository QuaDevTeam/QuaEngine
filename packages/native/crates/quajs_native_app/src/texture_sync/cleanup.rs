use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::renderer::NativeRendererHostCleanupRecord;
use quajs_wgpu_renderer::renderer::{
    NativeRenderBackend, NativeRenderer, NativeRendererPackageRelease,
};
use quajs_wgpu_renderer::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

use super::types::NativeTextureUploadSink;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureHostCleanupSyncReport {
    pub cleanup_record_count: usize,
    pub texture_release_candidate_count: usize,
    pub released_count: usize,
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
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTextureCleanedClearResult {
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub texture_cleanup_report: NativeTextureHostCleanupSyncReport,
}

pub fn sync_texture_releases_from_host_cleanup<S>(
    sink: &mut S,
    cleanup: &[NativeRendererHostCleanupRecord],
) -> NativeTextureHostCleanupSyncReport
where
    S: NativeTextureUploadSink,
{
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
        match sink.release_texture_resource(&record.resource_id) {
            Ok(true) => {
                report.released_count += 1;
                report
                    .released_resource_ids
                    .push(record.resource_id.clone());
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
pub fn release_package_resources_with_host_texture_cleanup<B, A>(
    renderer: &mut NativeRenderer<B, A>,
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

    NativeTextureCleanedPackageReleaseResult {
        package_release,
        texture_cleanup_report,
    }
}

#[allow(dead_code)]
pub fn release_package_resources_with_host_texture_cleanup_and_audio_teardown<B, A>(
    renderer: &mut NativeRenderer<B, A>,
    package_id: &str,
) -> Result<NativeTextureCleanedPackageReleaseResult, NativeAudioBackendError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
{
    let package_release =
        renderer.release_package_resources_and_apply_audio_teardown(package_id)?;
    let texture_cleanup_report = sync_texture_releases_from_host_cleanup(
        renderer.backend_mut(),
        &package_release.host_cleanup,
    );

    Ok(NativeTextureCleanedPackageReleaseResult {
        package_release,
        texture_cleanup_report,
    })
}

#[allow(dead_code)]
pub fn clear_renderer_with_host_texture_cleanup<B, A>(
    renderer: &mut NativeRenderer<B, A>,
) -> NativeTextureCleanedClearResult
where
    B: NativeRenderBackend + NativeTextureUploadSink,
{
    let (released_resources, host_cleanup) = renderer.clear_with_host_cleanup();
    let texture_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &host_cleanup);

    NativeTextureCleanedClearResult {
        released_resources,
        host_cleanup,
        texture_cleanup_report,
    }
}

#[allow(dead_code)]
pub fn clear_renderer_with_host_texture_cleanup_and_audio_teardown<B, A>(
    renderer: &mut NativeRenderer<B, A>,
) -> Result<NativeTextureCleanedClearResult, NativeAudioBackendError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
{
    let (released_resources, host_cleanup) =
        renderer.clear_with_host_cleanup_and_audio_teardown()?;
    let texture_cleanup_report =
        sync_texture_releases_from_host_cleanup(renderer.backend_mut(), &host_cleanup);

    Ok(NativeTextureCleanedClearResult {
        released_resources,
        host_cleanup,
        texture_cleanup_report,
    })
}

#[allow(dead_code)]
fn is_texture_cleanup_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::Texture | NativeResourceKind::DecodedImage
    )
}
