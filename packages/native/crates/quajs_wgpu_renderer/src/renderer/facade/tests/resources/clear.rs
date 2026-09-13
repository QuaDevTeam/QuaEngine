use super::super::{test_layout, view_with_background_and_choice, RecordingBackend};
use crate::renderer::NativeRenderer;
use crate::resources::{NativeResourceKind, ResourceId};

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

#[test]
fn clear_with_host_cleanup_returns_cleanup_records_and_preserves_backend() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();

    let (released, cleanup) = renderer.clear_with_host_cleanup();

    assert_eq!(released.len(), 1);
    assert_eq!(cleanup.len(), 1);
    assert_eq!(
        cleanup[0].resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(cleanup[0].kind, NativeResourceKind::Texture);
    assert!(!cleanup[0].declarative_asset);
    assert!(renderer.resources().is_empty());
    assert_eq!(renderer.backend().submissions.len(), 1);
}
