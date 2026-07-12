use super::NativeRendererProjectionRuntime;

#[test]
fn typewriter_progresses_without_new_pipeline_messages() {
    let frame = r#"{"view":{"dialogue":{"visible":true,"text":"abcdef","typewriter":{"enabled":true,"durationMs":1000}},"characters":[]}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    let first = runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 250.0)
        .unwrap();
    assert!(first.local_work_active);
    let first_json: serde_json::Value = serde_json::from_str(&first.json).unwrap();
    assert_eq!(
        first_json
            .pointer("/view/dialogue/text")
            .and_then(serde_json::Value::as_str),
        Some("ab")
    );
    assert!(runtime.reveal_dialogue_on_advance());
    let revealed = runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 250.0)
        .unwrap();
    assert!(!revealed.local_work_active);
    assert!(revealed.json.contains("abcdef"));
    assert_eq!(runtime.font_prewarm_texts(), vec!["abcdef"]);
}

#[test]
fn animation_interpolates_character_in_rust() {
    let frame = r#"{"view":{"characters":[{"id":"mira","position":{"x":10,"y":20}}],"animations":[{"startedAt":1000,"duration":1000,"resolvedTracks":[{"target":"character:mira","property":"position.x","keyframes":[{"at":0,"value":10},{"at":1000,"value":110}]}]}]}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    let rendered = runtime.project_at_epoch_ms(1500.0).unwrap();
    let rendered_json: serde_json::Value = serde_json::from_str(&rendered.json).unwrap();
    assert_eq!(
        rendered_json
            .pointer("/view/characters/0/position/x")
            .and_then(serde_json::Value::as_f64),
        Some(60.0)
    );
}

#[test]
fn scene_change_is_renderer_timed_and_emits_ready() {
    let frame = r#"{"view":{}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    runtime
        .apply_pipeline_event(
            "scene/change",
            r#"{"toScene":"next","transition":{"type":"fade","duration":100}}"#,
        )
        .unwrap();
    assert!(
        runtime
            .project_at_epoch_ms(runtime.received_epoch_ms + 50.0)
            .unwrap()
            .local_work_active
    );
    assert!(runtime.drain_intents().is_empty());
    runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 101.0)
        .unwrap();
    assert_eq!(
        runtime
            .drain_intents()
            .first()
            .map(|intent| intent.r#type.as_str()),
        Some("scene/ready")
    );
}
