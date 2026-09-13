use super::*;
use crate::projection::view::ViewProjection;
use crate::resources::NativeResourceKind;

#[test]
fn summarizes_declarative_ui_resource_sync() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_ui_surface());

    assert_eq!(update.resource_sync_summary.upsert_count, 1);
    assert_eq!(update.resource_sync_summary.declarative_upsert_count, 1);
    assert_eq!(
        update.resource_sync_summary.upsert_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(
        state
            .resources()
            .get("surface:ui/menu.qui")
            .unwrap()
            .owner_package_id
            .as_deref(),
        Some("runtime.ui")
    );

    let release = state.prepare_frame(test_layout(), &ViewProjection::default());

    assert_eq!(release.resource_sync_summary.release_count, 1);
    assert_eq!(release.resource_sync_summary.released_count, 1);
    assert_eq!(release.resource_sync_summary.replacement_release_count, 0);
    assert_eq!(release.resource_sync_summary.declarative_released_count, 1);
    assert_eq!(
        release.resource_sync_summary.released_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert!(
        release
            .resource_sync_summary
            .declarative_released_memory
            .cpu_bytes
            > 0
    );
    assert_eq!(
        release
            .resource_sync_summary
            .declarative_released_memory
            .gpu_bytes,
        0
    );
}
