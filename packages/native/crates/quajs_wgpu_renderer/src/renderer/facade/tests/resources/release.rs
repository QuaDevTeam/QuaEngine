use super::super::{test_layout, view_with_background_and_choice, RecordingBackend};
use crate::renderer::NativeRenderer;
use crate::resources::{NativeResourceKind, NativeResourceRecord, ResourceId};

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
