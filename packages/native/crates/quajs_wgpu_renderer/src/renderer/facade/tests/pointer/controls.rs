use super::*;
use quajs_native_runtime::InMemoryNativeHostApi;

const NATIVE_CONTROLS_FRAME: &str =
    include_str!("../../../../../../../test-fixtures/renderer/native-controls-frame.json");

#[test]
fn range_drag_updates_locally_and_emits_only_the_release_value() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render_json_str(NATIVE_CONTROLS_FRAME)
        .expect("native controls fixture should render");
    let (center, origin) = client_point_for_command(&renderer, "ui:settings:range");
    let layout = renderer.state().frame().unwrap().graph.layout;
    let right =
        stage_logical_to_client_point(&layout, StageLogicalPoint { x: 755.0, y: 204.0 }, origin);

    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, center, origin)
                .with_pointer_id(9)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap();
    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Move, right, origin)
                .with_pointer_id(9)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap();
    assert!(host.renderer_intents().is_empty());

    let local_submission = renderer.render_frame().unwrap();
    assert!(
        local_submission.command_count >= renderer.state().frame().unwrap().summary.command_count
    );

    let release = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, right, origin)
                .with_pointer_id(9)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();
    let emitted = release.emitted_intent.expect("range release should emit");
    let payload: serde_json::Value =
        serde_json::from_str(emitted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["patchJson"], "{\"speed\":30}");
    assert_eq!(host.renderer_intents().len(), 1);
}

#[test]
fn select_opens_locally_then_emits_the_chosen_option() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render_json_str(NATIVE_CONTROLS_FRAME)
        .expect("native controls fixture should render");
    let (select, origin) = client_point_for_command(&renderer, "ui:settings:select");

    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, select, origin)
                .with_pointer_id(10)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap();
    let opened = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, select, origin)
                .with_pointer_id(10)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();
    assert!(opened.emitted_intent.is_none());
    assert!(host.renderer_intents().is_empty());
    assert!(
        renderer.render_frame().unwrap().command_count
            > renderer.state().frame().unwrap().summary.command_count
    );

    let layout = renderer.state().frame().unwrap().graph.layout;
    let second_option =
        stage_logical_to_client_point(&layout, StageLogicalPoint { x: 420.0, y: 415.0 }, origin);
    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, second_option, origin)
                .with_pointer_id(11)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap();
    let selected = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, second_option, origin)
                .with_pointer_id(11)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();
    let emitted = selected
        .emitted_intent
        .expect("select option release should emit");
    let payload: serde_json::Value =
        serde_json::from_str(emitted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["patchJson"], "{\"skipMode\":\"all\"}");
    assert_eq!(host.renderer_intents().len(), 1);
}
