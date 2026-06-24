use super::*;
use crate::resources::{
    NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason, ResourceBudget,
    ResourceBudgetViolationCode, ResourceId,
};

#[test]
fn check_resource_budget_forwards_state_ledger_violations() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("texture", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(10, 90),
    );
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("voice", NativeResourceKind::AudioBuffer)
            .owned_by("runtime.voice")
            .memory(50, 0),
    );

    let violations = renderer.check_resource_budget(&ResourceBudget {
        max_cpu_bytes: Some(40),
        max_gpu_bytes: Some(80),
        max_total_bytes: Some(120),
        max_resource_count: Some(1),
        max_resource_count_by_kind: Default::default(),
        max_memory_by_kind: Default::default(),
    });
    let codes: Vec<_> = violations.iter().map(|violation| violation.code).collect();

    assert_eq!(
        codes,
        vec![
            ResourceBudgetViolationCode::CpuBytesExceeded,
            ResourceBudgetViolationCode::GpuBytesExceeded,
            ResourceBudgetViolationCode::TotalBytesExceeded,
            ResourceBudgetViolationCode::ResourceCountExceeded,
        ]
    );
}

#[test]
fn plan_package_unload_blocks_active_frame_resource() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let plan = renderer.plan_package_unload("base");

    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveFrameReference
    );
}

#[test]
fn release_package_resources_releases_inactive_resources_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    renderer.state_mut().resources_mut().insert(
        NativeResourceRecord::new("runtime:atlas", NativeResourceKind::GlyphAtlas)
            .owned_by("runtime.ui")
            .memory(512, 2048),
    );

    let release = renderer.release_package_resources("runtime.ui");

    assert_eq!(release.revision, 2);
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
    assert_eq!(release.summary.releasable_count, 1);
    assert_eq!(release.summary.released_count, 1);
    assert_eq!(release.summary.released_memory.gpu_bytes, 2048);
    assert!(renderer.resources().get("runtime:atlas").is_none());
    assert!(renderer.resources().get("images:bg/school.png").is_some());
    assert_eq!(renderer.backend().submissions.len(), 1);
}

#[test]
fn clear_releases_resources_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let released = renderer.clear();

    assert_eq!(released.len(), 1);
    assert!(renderer.state().frame().is_none());
    assert!(renderer.resources().is_empty());
    assert_eq!(renderer.backend().submissions.len(), 1);
}
