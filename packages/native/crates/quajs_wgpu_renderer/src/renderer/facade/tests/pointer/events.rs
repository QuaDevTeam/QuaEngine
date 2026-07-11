use super::*;

#[test]
fn pointer_release_event_dispatches_after_matching_press() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let press = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(press.event.pointer_id, 42);
    assert!(press.pointer.intent.is_some());
    assert!(press.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(resolution.event.pointer_id, 42);
    assert!(resolution.pointer.point.inside_viewport);
    assert!(resolution.pointer.point.inside_stage);
    assert_eq!(
        resolution
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        resolution
            .intent_to_dispatch
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_release_without_press_keeps_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        resolution
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert!(resolution.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_release_on_different_target_does_not_dispatch() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (stay_client, origin) = client_point_for_choice(&renderer, "choice:stay");
    let (leave_client, _) = client_point_for_choice(&renderer, "choice:leave");

    let press = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, stay_client, origin)
                .with_pointer_id(7)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        press
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("stay")
    );
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let release = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, leave_client, origin)
                .with_pointer_id(7)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();

    assert_eq!(
        release
            .pointer
            .intent
            .as_ref()
            .and_then(|hit| hit.intent.choice_id.as_deref()),
        Some("leave")
    );
    assert!(release.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_cancel_clears_pressed_target() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );

    let cancel = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Cancel, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert!(cancel.intent_to_dispatch.is_none());
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );

    let release = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
        )
        .unwrap();
    assert!(release.pointer.intent.is_some());
    assert!(release.intent_to_dispatch.is_none());
}

#[test]
fn pointer_press_and_move_events_keep_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    for phase in [
        NativePointerEventPhase::Press,
        NativePointerEventPhase::Move,
    ] {
        let resolution = renderer
            .pointer_event(
                NativePointerEvent::new(phase, client, origin)
                    .with_button(NativePointerButton::Primary),
            )
            .unwrap();

        assert!(resolution.pointer.intent.is_some());
        assert!(resolution.intent_to_dispatch.is_none());
    }
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );
}

#[test]
fn pointer_move_submits_transient_hover_feedback_only_while_targeted() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let projected_command_count = renderer.state().frame().unwrap().summary.command_count;
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let entered = renderer
        .pointer_event(NativePointerEvent::new(
            NativePointerEventPhase::Move,
            client,
            origin,
        ))
        .unwrap();
    assert!(entered.visual_state_changed);
    assert_eq!(
        renderer.state().pointer_interaction().hovered_command_id(),
        Some("choice:stay")
    );

    let hovered_submission = renderer.render_frame().unwrap();
    assert_eq!(
        hovered_submission.command_count,
        projected_command_count + 1
    );
    assert!(hovered_submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .flat_map(|batch| batch.command_ids.iter())
        .any(|command_id| command_id == "choice:stay::interaction"));
    assert_eq!(
        renderer.state().frame().unwrap().summary.command_count,
        projected_command_count
    );

    let left = renderer
        .pointer_event(NativePointerEvent::new(
            NativePointerEventPhase::Move,
            StageClientPoint {
                client_x: origin.left - 1.0,
                client_y: origin.top - 1.0,
            },
            origin,
        ))
        .unwrap();
    assert!(left.visual_state_changed);
    assert_eq!(
        renderer.state().pointer_interaction().hovered_command_id(),
        None
    );
    assert_eq!(
        renderer.render_frame().unwrap().command_count,
        projected_command_count
    );
}

#[test]
fn pointer_secondary_release_keeps_hit_metadata_without_dispatching() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let resolution = renderer
        .pointer_event(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_button(NativePointerButton::Secondary),
        )
        .unwrap();

    assert!(resolution.pointer.intent.is_some());
    assert!(resolution.intent_to_dispatch.is_none());
}

#[test]
fn pointer_event_returns_none_without_prepared_frame() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let resolution = renderer.pointer_event(NativePointerEvent::new(
        NativePointerEventPhase::Release,
        StageClientPoint {
            client_x: 100.0,
            client_y: 120.0,
        },
        StageClientRectOrigin::default(),
    ));

    assert!(resolution.is_none());
}
