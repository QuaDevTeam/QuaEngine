use super::*;
use crate::resources::{NativeResourceKind, PackageUnloadBlockerReason, ResourceId};

#[test]
fn package_unload_plan_blocks_active_frame_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let plan = state.plan_package_unload("base");

    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.releasable_memory.total_bytes(), 0);
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveFrameReference
    );
    assert!(state.resources().get("images:bg/school.png").is_some());
}

#[test]
fn package_unload_plan_blocks_active_projection_without_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_background_and_choice());

    let plan = state.plan_package_unload("runtime.choices");

    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("projection:runtime.choices")
    );
    assert_eq!(plan.blocked[0].kind, NativeResourceKind::RenderGraph);
    assert_eq!(
        plan.blocked[0].owner_package_id.as_deref(),
        Some("runtime.choices")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveProjectionReference
    );
}

#[test]
fn package_unload_plan_blocks_active_projection_required_package_without_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_runtime_choice_only());

    let plan = state.plan_package_unload("base");

    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("projection:required:base")
    );
    assert_eq!(plan.blocked[0].kind, NativeResourceKind::RenderGraph);
    assert!(plan.blocked[0].owner_package_id.is_none());
    assert_eq!(
        plan.blocked[0].required_package_ids,
        ["base".to_string()].into_iter().collect()
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveProjectionReference
    );
}
