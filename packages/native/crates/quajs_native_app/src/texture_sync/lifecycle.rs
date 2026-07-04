use std::collections::BTreeSet;

use quajs_native_runtime::{NativeHostApi, NativeHostApiError, NativeMountedBundleInfo};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};

use super::cleanup::{
    release_package_resources_with_host_texture_cleanup, NativeTextureCleanedPackageReleaseResult,
};
use super::types::NativeTextureUploadSink;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureBundleMountRegistry {
    initialized: bool,
    tracked_package_ids: BTreeSet<String>,
}

impl NativeTextureBundleMountRegistry {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(dead_code)]
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    #[allow(dead_code)]
    pub fn tracked_package_ids(&self) -> Vec<String> {
        self.tracked_package_ids.iter().cloned().collect()
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeTextureBundleLifecycleSyncReport {
    pub initial_sync: bool,
    pub observed_bundle_count: usize,
    pub current_package_ids: Vec<String>,
    pub added_package_ids: Vec<String>,
    pub removed_package_ids: Vec<String>,
    pub blocked_package_ids: Vec<String>,
    pub retained_blocked_package_ids: Vec<String>,
    pub released_package_ids: Vec<String>,
    pub tracked_package_ids: Vec<String>,
    pub release_attempt_count: usize,
    pub released_resource_count: usize,
    pub texture_cleanup_error_count: usize,
    pub package_releases: Vec<NativeTextureCleanedPackageReleaseResult>,
}

#[allow(dead_code)]
pub fn sync_mounted_texture_bundle_lifecycle_from_host<B, A, H>(
    registry: &mut NativeTextureBundleMountRegistry,
    renderer: &mut NativeRenderer<B, A>,
    host: &H,
) -> Result<NativeTextureBundleLifecycleSyncReport, NativeHostApiError>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    H: NativeHostApi,
{
    let bundles = host.list_mounted_bundles()?;
    let current_package_ids = mounted_package_ids(&bundles);
    let initial_sync = !registry.initialized;
    let previous_package_ids = registry.tracked_package_ids.clone();

    let added_package_ids = if initial_sync {
        current_package_ids.clone()
    } else {
        current_package_ids
            .difference(&previous_package_ids)
            .cloned()
            .collect()
    };
    let removed_package_ids: BTreeSet<String> = if initial_sync {
        BTreeSet::new()
    } else {
        previous_package_ids
            .difference(&current_package_ids)
            .cloned()
            .collect()
    };

    let mut blocked_package_ids = BTreeSet::new();
    let mut released_package_ids = Vec::new();
    let mut release_attempt_count = 0;
    let mut released_resource_count = 0;
    let mut texture_cleanup_error_count = 0;
    let mut package_releases = Vec::new();

    for package_id in &removed_package_ids {
        let release = release_package_resources_with_host_texture_cleanup(renderer, package_id);
        release_attempt_count += 1;
        released_resource_count += release.package_release.released_resources.len();
        texture_cleanup_error_count += release.texture_cleanup_report.release_error_count;

        if release.package_release.plan.can_unload() {
            released_package_ids.push(package_id.clone());
        } else {
            blocked_package_ids.insert(package_id.clone());
        }

        package_releases.push(release);
    }

    let mut next_tracked_package_ids = current_package_ids.clone();
    next_tracked_package_ids.extend(blocked_package_ids.iter().cloned());
    registry.initialized = true;
    registry.tracked_package_ids = next_tracked_package_ids.clone();

    Ok(NativeTextureBundleLifecycleSyncReport {
        initial_sync,
        observed_bundle_count: bundles.len(),
        current_package_ids: vec_from_set(&current_package_ids),
        added_package_ids: vec_from_set(&added_package_ids),
        removed_package_ids: vec_from_set(&removed_package_ids),
        blocked_package_ids: vec_from_set(&blocked_package_ids),
        retained_blocked_package_ids: vec_from_set(&blocked_package_ids),
        released_package_ids,
        tracked_package_ids: vec_from_set(&next_tracked_package_ids),
        release_attempt_count,
        released_resource_count,
        texture_cleanup_error_count,
        package_releases,
    })
}

fn mounted_package_ids(bundles: &[NativeMountedBundleInfo]) -> BTreeSet<String> {
    bundles
        .iter()
        .filter_map(mounted_package_id)
        .collect::<BTreeSet<_>>()
}

fn mounted_package_id(bundle: &NativeMountedBundleInfo) -> Option<String> {
    bundle
        .runtime_package_id
        .as_deref()
        .or(bundle.logical_name.as_deref())
        .or(Some(bundle.name.as_str()))
        .and_then(non_empty_package_id)
}

fn non_empty_package_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn vec_from_set(values: &BTreeSet<String>) -> Vec<String> {
    values.iter().cloned().collect()
}
