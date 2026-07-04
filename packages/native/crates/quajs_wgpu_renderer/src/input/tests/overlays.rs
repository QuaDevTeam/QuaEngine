use crate::input::{native_renderer_intent_from_hit, resolve_renderer_intent_at};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};

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
