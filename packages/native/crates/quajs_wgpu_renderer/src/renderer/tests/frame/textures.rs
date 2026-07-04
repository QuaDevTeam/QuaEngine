use super::*;
use crate::resources::ResourceId;

#[test]
fn exposes_texture_upload_requests_on_frame_update() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.texture_uploads.requests.len(), 1);
    assert!(update.texture_uploads.skipped_resource_ids.is_empty());
    assert!(update.texture_uploads.non_texture_resource_ids.is_empty());

    let request = update
        .texture_uploads
        .request("images", "bg/school.png")
        .unwrap();
    assert_eq!(
        request.resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        request.command_ids,
        BTreeSet::from(["background:main".to_string()])
    );
    assert_eq!(
        request.package_candidates,
        BTreeSet::from(["base".to_string()])
    );
}
