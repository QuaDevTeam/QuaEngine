use super::*;
use crate::resources::{
    NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason, ResourceId,
};

#[test]
fn release_package_resources_returns_blocked_plan_without_releasing_active_frame_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());
    state.resources_mut().insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );

    let release = state.release_package_resources("base");

    assert_eq!(release.revision, 1);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.releasable_count, 0);
    assert_eq!(release.summary.blocked_count, 1);
    assert_eq!(release.summary.released_count, 0);
    assert_eq!(release.summary.released_memory.total_bytes(), 0);
    assert_eq!(release.summary.blocked_memory.cpu_bytes, 128);
    assert_eq!(release.summary.blocked_memory.gpu_bytes, 4096);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason[&PackageUnloadBlockerReason::ActiveFrameReference],
        1
    );
    assert_eq!(
        release.summary.blocked_memory_by_kind[&NativeResourceKind::Texture].gpu_bytes,
        4096
    );
    assert_eq!(
        release.summary.blocked_memory_by_reason[&PackageUnloadBlockerReason::ActiveFrameReference]
            .cpu_bytes,
        128
    );
    assert_eq!(state.revision(), 1);
    assert!(state.resources().get("images:bg/school.png").is_some());
}

#[test]
fn release_package_resources_reports_active_projection_blocker_without_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let release = state.release_package_resources("runtime.choices");

    assert_eq!(release.revision, 1);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.releasable_count, 0);
    assert_eq!(release.summary.blocked_count, 1);
    assert_eq!(release.summary.blocked_memory.total_bytes(), 0);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::RenderGraph],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason[&PackageUnloadBlockerReason::ActiveProjectionReference],
        1
    );
}

#[test]
fn release_package_resources_summarizes_foreign_resource_blocker_memory() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("runtime:diff", NativeResourceKind::DecodedImage)
            .owned_by("runtime.diff")
            .require_package("base")
            .memory(256, 64),
    );

    let release = state.release_package_resources("base");

    assert_eq!(release.revision, 0);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.blocked_count, 1);
    assert_eq!(release.summary.blocked_memory.cpu_bytes, 256);
    assert_eq!(release.summary.blocked_memory.gpu_bytes, 64);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::DecodedImage],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason
            [&PackageUnloadBlockerReason::PackageRequiredByForeignResource],
        1
    );
    assert_eq!(
        release.summary.blocked_memory_by_kind[&NativeResourceKind::DecodedImage].cpu_bytes,
        256
    );
    assert_eq!(
        release.summary.blocked_memory_by_reason
            [&PackageUnloadBlockerReason::PackageRequiredByForeignResource]
            .gpu_bytes,
        64
    );
    assert!(state.resources().get("runtime:diff").is_some());
}

#[test]
fn release_package_resources_summarizes_owner_dependency_blocker_memory() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("sprite:merged", NativeResourceKind::Texture)
            .owned_by("runtime.diff")
            .require_packages(["base", "runtime.diff"])
            .memory(100, 300),
    );

    let release = state.release_package_resources("runtime.diff");

    assert_eq!(release.revision, 0);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.blocked_count, 1);
    assert_eq!(release.summary.blocked_memory.cpu_bytes, 100);
    assert_eq!(release.summary.blocked_memory.gpu_bytes, 300);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason
            [&PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage],
        1
    );
    assert_eq!(
        release.summary.blocked_memory_by_kind[&NativeResourceKind::Texture].gpu_bytes,
        300
    );
    assert_eq!(
        release.summary.blocked_memory_by_reason
            [&PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage]
            .cpu_bytes,
        100
    );
    assert!(state.resources().get("sprite:merged").is_some());
}

#[test]
fn release_package_resources_releases_inactive_package_resources() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("runtime:atlas", NativeResourceKind::GlyphAtlas)
            .owned_by("runtime.ui")
            .memory(512, 2048),
    );

    let release = state.release_package_resources("runtime.ui");

    assert_eq!(release.revision, 1);
    assert!(release.plan.can_unload());
    assert_eq!(
        release.plan.releasable,
        vec![ResourceId::from("runtime:atlas")]
    );
    assert_eq!(release.released_resources.len(), 1);
    assert_eq!(
        release.released_resources[0].id,
        ResourceId::from("runtime:atlas")
    );
    assert_eq!(release.host_cleanup.len(), 1);
    assert_eq!(
        release.host_cleanup[0].resource_id,
        ResourceId::from("runtime:atlas")
    );
    assert_eq!(
        release.host_cleanup[0].owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert_eq!(release.host_cleanup[0].memory.gpu_bytes, 2048);
    assert_eq!(release.summary.releasable_count, 1);
    assert_eq!(release.summary.blocked_count, 0);
    assert_eq!(release.summary.released_count, 1);
    assert_eq!(release.summary.released_memory.cpu_bytes, 512);
    assert_eq!(release.summary.released_memory.gpu_bytes, 2048);
    assert_eq!(
        release.summary.released_by_kind[&NativeResourceKind::GlyphAtlas],
        1
    );
    assert_eq!(release.summary.blocked_memory.total_bytes(), 0);
    assert!(release.summary.blocked_by_kind.is_empty());
    assert!(release.summary.blocked_by_reason.is_empty());
    assert!(release.summary.blocked_memory_by_kind.is_empty());
    assert!(release.summary.blocked_memory_by_reason.is_empty());
    assert!(state.resources().get("runtime:atlas").is_none());
}
