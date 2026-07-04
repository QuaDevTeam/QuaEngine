use std::collections::BTreeSet;

use quajs_native_runtime::NativeMountedBundleInfo;
use quajs_wgpu_renderer::projection::background::BackgroundProjection;
use quajs_wgpu_renderer::projection::common::PackageProvenance;
use quajs_wgpu_renderer::projection::view::ViewProjection;
use quajs_wgpu_renderer::resources::{
    NativeTextureUploadRequest, NativeTextureUploadSyncPlan, ResourceId,
};
use quajs_wgpu_renderer::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

pub(crate) fn bundle(name: &str, runtime_package_id: Option<&str>) -> NativeMountedBundleInfo {
    NativeMountedBundleInfo {
        name: name.to_string(),
        logical_name: None,
        version: Some(1),
        hash: None,
        runtime_package_id: runtime_package_id.map(ToString::to_string),
    }
}

pub(crate) fn sync_plan<const N: usize>(
    pending_requests: [NativeTextureUploadRequest; N],
) -> NativeTextureUploadSyncPlan {
    NativeTextureUploadSyncPlan {
        pending_requests: pending_requests.into(),
        ..Default::default()
    }
}

pub(crate) fn texture_request<const O: usize, const R: usize, const C: usize>(
    resource_id: &str,
    asset_type: &str,
    asset_name: &str,
    owners: [&str; O],
    required: [&str; R],
    candidates: [&str; C],
) -> NativeTextureUploadRequest {
    NativeTextureUploadRequest {
        resource_id: ResourceId::from(resource_id),
        asset_type: asset_type.to_string(),
        asset_name: asset_name.to_string(),
        command_ids: BTreeSet::new(),
        owner_package_ids: set(owners),
        required_package_ids: set(required),
        package_candidates: set(candidates),
    }
}

pub(crate) fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}

pub(crate) fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}

pub(crate) fn view_with_background() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn provenance<const N: usize>(owner_package_id: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner_package_id.to_string()),
        required_runtime_packages: set(required),
    }
}
