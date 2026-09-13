use super::super::{test_layout, view_with_background_and_choice, RecordingBackend};
use crate::renderer::NativeRenderer;
use crate::resources::{PackageUnloadBlockerReason, ResourceId};

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
fn plan_package_unload_blocks_active_projection_without_resources() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let plan = renderer.plan_package_unload("runtime.choices");

    assert!(!plan.can_unload());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].resource_id,
        ResourceId::from("projection:runtime.choices")
    );
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::ActiveProjectionReference
    );
}
