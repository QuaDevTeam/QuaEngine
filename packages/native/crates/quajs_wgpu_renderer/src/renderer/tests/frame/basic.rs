use super::*;
use crate::resources::NativeResourceKind;

#[test]
fn prepares_frame_and_populates_resource_ledger() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 1);
    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert!(update.resource_sync.retain.is_empty());
    assert!(update.released_resources.is_empty());
    assert_eq!(update.resource_sync_summary.upsert_count, 1);
    assert_eq!(
        update.resource_sync_summary.upsert_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(update.resource_sync_summary.release_count, 0);
    assert_eq!(update.resource_sync_summary.released_count, 0);
    assert_eq!(update.resource_sync_summary.replacement_release_count, 0);
    assert_eq!(state.frame().unwrap().summary.command_count, 3);
    assert_eq!(state.resources().len(), 1);
    assert!(state.resources().get("images:bg/school.png").is_some());
}
