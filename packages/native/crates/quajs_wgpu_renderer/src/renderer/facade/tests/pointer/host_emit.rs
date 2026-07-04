use super::*;
use quajs_native_runtime::InMemoryNativeHostApi;

#[test]
fn pointer_release_event_emits_native_renderer_intent_to_host() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    let press = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();

    assert!(press.emitted_intent.is_none());
    assert!(host.renderer_intents().is_empty());

    let release = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(42)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();

    let emitted = release.emitted_intent.unwrap();
    assert_eq!(emitted.r#type, "choice/select");
    let payload: serde_json::Value =
        serde_json::from_str(emitted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["choiceId"], "stay");
    assert_eq!(host.renderer_intents(), &[emitted]);
}

#[test]
fn compiled_qui_qss_button_pointer_release_emits_ui_intent_to_host() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should render");
    let (client, origin) = client_point_for_command(&renderer, "ui:compiled-menu:open-settings");

    let press = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(77)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();

    assert!(press.resolution.pointer.intent.is_some());
    assert!(press.emitted_intent.is_none());
    assert!(host.renderer_intents().is_empty());

    let release = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(77)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();

    let hit = release
        .resolution
        .intent_to_dispatch
        .as_ref()
        .expect("settings button should dispatch after matching release");
    assert_eq!(hit.command_id, "ui:compiled-menu:open-settings");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.action.as_deref(), Some("open"));
    assert_eq!(
        hit.intent.element_id.as_deref(),
        Some("compiled-menu:open-settings")
    );
    assert_eq!(
        hit.intent.metadata.get("arg0"),
        Some(&serde_json::json!("settings"))
    );

    let emitted = release.emitted_intent.unwrap();
    assert_eq!(emitted.r#type, "ui/intent");
    let payload: serde_json::Value =
        serde_json::from_str(emitted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["action"], "open");
    assert_eq!(payload["arg0"], "settings");
    assert_eq!(payload["elementId"], "compiled-menu:open-settings");
    assert_eq!(host.renderer_intents(), &[emitted]);
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn pointer_event_emit_returns_none_without_prepared_frame_or_host_side_effects() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());

    let resolution = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(
                NativePointerEventPhase::Release,
                StageClientPoint {
                    client_x: 100.0,
                    client_y: 120.0,
                },
                StageClientRectOrigin::default(),
            ),
            &mut host,
        )
        .unwrap();

    assert!(resolution.is_none());
    assert!(host.renderer_intents().is_empty());
}
