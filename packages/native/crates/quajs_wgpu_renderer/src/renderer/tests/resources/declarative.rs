use super::*;
use crate::resources::{NativeResourceKind, NativeResourceRecord, PackageUnloadBlockerReason};

#[test]
fn release_package_resources_summarizes_declarative_release_memory() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("surface:ui/menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .memory(1024, 0),
    );
    state.resources_mut().insert(
        NativeResourceRecord::new("qss:themes/default.qss.json", NativeResourceKind::QssStyle)
            .owned_by("runtime.ui")
            .memory(512, 0),
    );
    state.resources_mut().insert(
        NativeResourceRecord::new(
            "tokens:themes/default.tokens.json",
            NativeResourceKind::TokenTable,
        )
        .owned_by("runtime.ui")
        .memory(256, 0),
    );

    let release = state.release_package_resources("runtime.ui");

    assert!(release.plan.can_unload());
    assert_eq!(release.summary.released_count, 3);
    assert_eq!(release.summary.declarative_released_count, 3);
    assert_eq!(release.summary.declarative_blocked_count, 0);
    assert_eq!(release.summary.declarative_released_memory.cpu_bytes, 1792);
    assert_eq!(release.summary.declarative_released_memory.gpu_bytes, 0);
    assert_eq!(release.summary.declarative_blocked_memory.total_bytes(), 0);
    assert_eq!(release.host_cleanup.len(), 3);
    assert!(release
        .host_cleanup
        .iter()
        .all(|cleanup| cleanup.declarative_asset));
    assert_eq!(
        release.summary.released_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(
        release.summary.released_by_kind[&NativeResourceKind::QssStyle],
        1
    );
    assert_eq!(
        release.summary.released_by_kind[&NativeResourceKind::TokenTable],
        1
    );
    assert!(state.resources().is_empty());
}

#[test]
fn release_package_resources_summarizes_blocked_declarative_memory() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_ui_surface());
    state.resources_mut().insert(
        NativeResourceRecord::new("surface:ui/menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .memory(1024, 0),
    );

    let release = state.release_package_resources("runtime.ui");

    assert_eq!(release.revision, 1);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.released_count, 0);
    assert_eq!(release.summary.declarative_released_count, 0);
    assert_eq!(release.summary.declarative_blocked_count, 1);
    assert!(release.summary.declarative_blocked_memory.cpu_bytes > 0);
    assert_eq!(release.summary.declarative_blocked_memory.gpu_bytes, 0);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason[&PackageUnloadBlockerReason::ActiveFrameReference],
        1
    );
    assert!(state.resources().get("surface:ui/menu.qui").is_some());
}
