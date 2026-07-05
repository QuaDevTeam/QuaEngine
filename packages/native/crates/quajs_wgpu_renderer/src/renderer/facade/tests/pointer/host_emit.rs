use super::*;
use quajs_native_runtime::{
    InMemoryNativeHostApi, NativeAssetReadRequest, NativeHostApi, NativeHostApiError,
    NativeHostApiResult, NativeHostInfo, NativeMountedBundleInfo, NativeRendererIntent,
    NativeSignatureVerifyRequest,
};

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
fn compiled_choice_loop_pointer_release_emits_choice_intent_to_host() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render_json_str(COMPILED_CHOICE_LOOP_FRAME)
        .expect("compiled choice loop fixture should render");
    let (client, origin) = client_point_for_command(&renderer, "ui:choice-menu:choice-button:stay");

    let press = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(78)
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
                .with_pointer_id(78)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .unwrap();

    let hit = release
        .resolution
        .intent_to_dispatch
        .as_ref()
        .expect("compiled choice button should dispatch after matching release");
    assert_eq!(hit.command_id, "ui:choice-menu:choice-button:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
    assert_eq!(hit.intent.action.as_deref(), Some("select"));
    assert_eq!(
        hit.intent.element_id.as_deref(),
        Some("choice-menu:choice-button:stay")
    );

    let emitted = release.emitted_intent.unwrap();
    assert_eq!(emitted.r#type, "choice/select");
    let payload: serde_json::Value =
        serde_json::from_str(emitted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["choiceId"], "stay");
    assert_eq!(payload["action"], "select");
    assert_eq!(payload["arg0"], "stay");
    assert_eq!(payload["elementId"], "choice-menu:choice-button:stay");
    assert_ne!(payload["choiceId"], "forged-choice");
    assert_ne!(payload["action"], "forged-action");
    assert_ne!(payload["elementId"], "forged-element");
    assert_eq!(host.renderer_intents(), &[emitted]);
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[test]
fn cancel_pointer_interaction_prevents_stale_release_intent_emit() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = InMemoryNativeHostApi::new(test_host_info());
    renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should render");
    let (client, origin) = client_point_for_command(&renderer, "ui:compiled-menu:open-settings");

    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(177)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .expect("press should resolve");

    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        1
    );
    assert!(renderer.cancel_pointer_interaction(177));
    assert!(!renderer.cancel_pointer_interaction(177));
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );

    let release = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(177)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .expect("release still resolves hit metadata");

    assert!(release.resolution.pointer.intent.is_some());
    assert!(release.resolution.intent_to_dispatch.is_none());
    assert!(release.emitted_intent.is_none());
    assert!(host.renderer_intents().is_empty());
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

#[test]
fn pointer_release_event_returns_host_error_when_intent_emit_fails() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());
    let mut host = FailingRendererIntentHost::default();
    renderer
        .prepare_and_render(test_layout(), &view_with_background_and_choice())
        .unwrap();
    let (client, origin) = client_point_for_choice(&renderer, "choice:stay");

    renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Press, client, origin)
                .with_pointer_id(91)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .unwrap()
        .expect("press should resolve without host emit");

    let error = renderer
        .pointer_event_and_emit_intent(
            NativePointerEvent::new(NativePointerEventPhase::Release, client, origin)
                .with_pointer_id(91)
                .with_button(NativePointerButton::Primary),
            &mut host,
        )
        .expect_err("host emit failure should reach the caller");

    assert!(matches!(error, NativeHostApiError::InvalidRequest(_)));
    assert_eq!(host.attempted_intents.len(), 1);
    let attempted = &host.attempted_intents[0];
    assert_eq!(attempted.r#type, "choice/select");
    let payload: serde_json::Value =
        serde_json::from_str(attempted.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["choiceId"], "stay");
    assert_eq!(
        renderer.state().pointer_interaction().active_press_count(),
        0
    );
}

#[derive(Default)]
struct FailingRendererIntentHost {
    attempted_intents: Vec<NativeRendererIntent>,
}

impl NativeHostApi for FailingRendererIntentHost {
    fn host_info(&self) -> NativeHostInfo {
        test_host_info()
    }

    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>> {
        Err(NativeHostApiError::AssetNotFound(request.url.clone()))
    }

    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
        Ok(Vec::new())
    }

    fn read_storage(&self, _key: &str) -> NativeHostApiResult<Option<Vec<u8>>> {
        Ok(None)
    }

    fn write_storage(&mut self, _key: &str, _value: Vec<u8>) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn delete_storage(&mut self, _key: &str) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn list_storage_keys(&self, _prefix: &str) -> NativeHostApiResult<Vec<String>> {
        Ok(Vec::new())
    }

    fn hash_bytes(&self, _bytes: &[u8], algorithm: &str) -> NativeHostApiResult<String> {
        Err(NativeHostApiError::UnsupportedOperation(format!(
            "hash algorithm {algorithm} is not wired in this host"
        )))
    }

    fn verify_signature(
        &self,
        _request: &NativeSignatureVerifyRequest,
    ) -> NativeHostApiResult<bool> {
        Err(NativeHostApiError::UnsupportedOperation(
            "signature verification is not wired in this host".to_string(),
        ))
    }

    fn emit_renderer_intent(&mut self, event: NativeRendererIntent) -> NativeHostApiResult<()> {
        self.attempted_intents.push(event);
        Err(NativeHostApiError::InvalidRequest(
            "renderer intent sink unavailable".to_string(),
        ))
    }
}
