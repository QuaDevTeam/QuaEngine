use crate::input::{
    native_renderer_intent_from_hit, native_renderer_intent_from_renderer_intent,
    resolve_renderer_intent_at,
};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::RendererIntent;

use super::support::test_layout;

#[test]
fn resolves_ui_overlay_intent_above_choices() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ui: Some(UiProjection::new(vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
                intent: Some(
                    UiIntentProjection::new("close")
                        .with_metadata("source", serde_json::json!("overlay"))
                        .with_metadata("elementId", serde_json::json!("forged")),
                ),
                ..UiOverlayProjection::new("menu")
            }])),
            ..Default::default()
        },
    );
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:choice-a")
        .unwrap();

    let hit = resolve_renderer_intent_at(
        &graph,
        choice.bounds.x + choice.bounds.width / 2.0,
        choice.bounds.y + choice.bounds.height / 2.0,
    )
    .unwrap();

    assert_eq!(hit.command_id, "ui:menu");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu"));
    assert_eq!(hit.intent.action.as_deref(), Some("close"));
    assert_eq!(
        hit.intent.metadata.get("source"),
        Some(&serde_json::json!("overlay"))
    );
    assert_eq!(
        hit.intent.metadata.get("elementId"),
        Some(&serde_json::json!("forged"))
    );
    assert!(hit.intent.choice_id.is_none());

    let event = native_renderer_intent_from_hit(&hit);
    let payload: serde_json::Value =
        serde_json::from_str(event.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["action"], "close");
    assert_eq!(payload["elementId"], "menu");
    assert_eq!(payload["source"], "overlay");
}

#[test]
fn interactive_overlay_without_action_blocks_underlying_choice_intent() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ui: Some(UiProjection::new(vec![
                UiOverlayProjection::new("menu").with_surface("ui/menu.qui")
            ])),
            ..Default::default()
        },
    );
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:choice-a")
        .unwrap();

    assert!(resolve_renderer_intent_at(
        &graph,
        choice.bounds.x + choice.bounds.width / 2.0,
        choice.bounds.y + choice.bounds.height / 2.0,
    )
    .is_none());
}

#[test]
fn native_renderer_intent_payload_drops_oversized_metadata() {
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert(
        "arg0".to_string(),
        serde_json::Value::String("x".repeat(20 * 1024)),
    );

    let event = native_renderer_intent_from_renderer_intent(&RendererIntent {
        event: "ui/intent".to_string(),
        choice_id: None,
        element_id: Some("menu".to_string()),
        action: Some("open".to_string()),
        metadata,
    });

    let payload: serde_json::Value =
        serde_json::from_str(event.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["action"], "open");
    assert_eq!(payload["elementId"], "menu");
    assert!(payload.get("arg0").is_none());
}

#[test]
fn native_renderer_intent_payload_filters_unsafe_canonical_fields() {
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert(
        "action".to_string(),
        serde_json::Value::String("forged".to_string()),
    );
    metadata.insert(
        "source".to_string(),
        serde_json::Value::String("button".to_string()),
    );

    let event = native_renderer_intent_from_renderer_intent(&RendererIntent {
        event: "ui/intent".to_string(),
        choice_id: Some("../choice".to_string()),
        element_id: Some("/menu".to_string()),
        action: Some("native:open".to_string()),
        metadata,
    });

    let payload: serde_json::Value =
        serde_json::from_str(event.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(payload["source"], "button");
    assert!(payload.get("action").is_none());
    assert!(payload.get("choiceId").is_none());
    assert!(payload.get("elementId").is_none());
}
