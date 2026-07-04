use crate::frame::prepare_native_frame;
use crate::render_graph::RenderPlane;
use crate::resources::{NativeResourceKind, ResourceId};

use super::support::{test_layout, view_with_background_character_and_choices};

#[test]
fn prepares_graph_summary_and_resource_plan_for_view() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());

    assert_eq!(frame.summary.command_count, 5);
    assert_eq!(frame.summary.interactive_count, 1);
    assert_eq!(frame.summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        frame.summary.by_plane[&RenderPlane::Subject].command_count,
        1
    );
    assert_eq!(frame.summary.by_plane[&RenderPlane::Safe].command_count, 3);
    assert_eq!(frame.passes.passes.len(), 3);
    assert_eq!(frame.passes.command_count, frame.summary.command_count);
    assert_eq!(frame.resources.requests.len(), 2);
    assert_eq!(frame.resources.by_kind[&NativeResourceKind::Texture], 2);
    assert_eq!(frame.assets.requests.len(), 2);
    assert!(frame.assets.skipped_resource_ids.is_empty());
    assert!(frame
        .resources
        .request(ResourceId::from("images:bg/school.png"))
        .is_some());
    assert!(frame.assets.request("images", "bg/school.png").is_some());
    assert!(frame
        .assets
        .request("characters", "yuki/default.png")
        .is_some());
}

#[test]
fn resolves_hit_intent_from_prepared_frame() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());
    let command = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = frame
        .hit_intent(
            command.bounds.x + command.bounds.width / 2.0,
            command.bounds.y + command.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}
