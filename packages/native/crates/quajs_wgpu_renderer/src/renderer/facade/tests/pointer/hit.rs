use super::*;

#[test]
fn exposes_hit_intents_from_latest_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let choice = renderer
        .state()
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = renderer
        .hit_intent(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn exposes_pointer_intents_from_latest_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let resolution = renderer.pointer_intent(client, origin).unwrap();

    assert!(resolution.point.inside_viewport);
    assert!(resolution.point.inside_stage);
    let hit = resolution.intent.unwrap();
    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn pointer_intent_returns_none_without_prepared_frame() {
    let renderer = NativeRenderer::new(RecordingBackend::default());

    let resolution = renderer.pointer_intent(
        StageClientPoint {
            client_x: 100.0,
            client_y: 120.0,
        },
        StageClientRectOrigin::default(),
    );

    assert!(resolution.is_none());
}
