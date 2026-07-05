use super::*;

#[test]
fn appends_ui_commands_to_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![
            UiOverlayProjection::new("menu").with_surface("ui/menu.qui")
        ]),
    );

    assert_eq!(graph.commands()[0].id, "ui:menu");
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Screen].command_count,
        1
    );
    assert_eq!(graph.summary().interactive_count, 1);
}

#[test]
fn resolves_inline_ui_surface_button_intent_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Box,
                        rect(0.0, 0.0, 400.0, 260.0),
                    )
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "settings",
                        UiSurfaceNodeKind::Button,
                        rect(100.0, 80.0, 160.0, 48.0),
                    )
                    .with_text("Settings")
                    .with_intent(UiIntentProjection::new("open-settings"))]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:settings");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:settings"));
    assert_eq!(hit.intent.action.as_deref(), Some("open-settings"));
}

#[test]
fn resolves_inline_ui_surface_box_intent_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "hotspot",
                        UiSurfaceNodeKind::Box,
                        rect(48.0, 64.0, 240.0, 120.0),
                    )
                    .with_intent(
                        UiIntentProjection::new("open")
                            .with_metadata("target", serde_json::json!("gallery")),
                    ),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 80.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:hotspot");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:hotspot"));
    assert_eq!(hit.intent.action.as_deref(), Some("open"));
    assert_eq!(
        hit.intent.metadata.get("target"),
        Some(&serde_json::json!("gallery"))
    );
}

#[test]
fn resolves_inline_ui_surface_backdrop_and_panel_intents_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Stack,
                        rect(0.0, 0.0, 480.0, 160.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "shade",
                            UiSurfaceNodeKind::Backdrop,
                            rect(0.0, 0.0, 200.0, 120.0),
                        )
                        .with_intent(UiIntentProjection::new("close")),
                        UiSurfaceNodeProjection::new(
                            "settings",
                            UiSurfaceNodeKind::Panel,
                            rect(240.0, 0.0, 200.0, 120.0),
                        )
                        .with_intent(UiIntentProjection::new("open-settings")),
                    ]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let backdrop_hit = resolve_renderer_intent_at(&graph, 48.0, 40.0).unwrap();
    let panel_hit = resolve_renderer_intent_at(&graph, 280.0, 40.0).unwrap();

    assert_eq!(backdrop_hit.command_id, "ui:menu:shade");
    assert_eq!(backdrop_hit.intent.action.as_deref(), Some("close"));
    assert_eq!(panel_hit.command_id, "ui:menu:settings");
    assert_eq!(panel_hit.intent.action.as_deref(), Some("open-settings"));
}

#[test]
fn ignores_inline_ui_surface_intents_on_non_projectable_nodes() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Stack,
                        rect(0.0, 0.0, 640.0, 260.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "label",
                            UiSurfaceNodeKind::Text,
                            rect(24.0, 24.0, 160.0, 40.0),
                        )
                        .with_text("Label")
                        .with_intent(UiIntentProjection::new("text-action")),
                        UiSurfaceNodeProjection::new(
                            "rich",
                            UiSurfaceNodeKind::RichText,
                            rect(216.0, 24.0, 160.0, 40.0),
                        )
                        .with_text("Rich")
                        .with_intent(UiIntentProjection::new("rich-action")),
                        UiSurfaceNodeProjection::new(
                            "poster",
                            UiSurfaceNodeKind::Image,
                            rect(408.0, 24.0, 160.0, 80.0),
                        )
                        .with_image(UiSurfaceImageProjection::new("ui/poster.png"))
                        .with_intent(UiIntentProjection::new("image-action")),
                        UiSurfaceNodeProjection::new(
                            "divider",
                            UiSurfaceNodeKind::Divider,
                            rect(24.0, 120.0, 240.0, 2.0),
                        )
                        .with_intent(UiIntentProjection::new("divider-action")),
                        UiSurfaceNodeProjection::new(
                            "scroll",
                            UiSurfaceNodeKind::Scroll,
                            rect(304.0, 120.0, 240.0, 96.0),
                        )
                        .with_intent(UiIntentProjection::new("scroll-action")),
                    ]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    for (x, y) in [
        (48.0, 40.0),
        (240.0, 40.0),
        (440.0, 48.0),
        (48.0, 121.0),
        (340.0, 148.0),
    ] {
        assert!(
            resolve_renderer_intent_at(&graph, x, y).is_none(),
            "unexpected intent at {x},{y}",
        );
    }
}

#[test]
fn surface_choice_intent_payload_preserves_canonical_dispatch_fields() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/choices.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Box,
                        rect(0.0, 0.0, 400.0, 260.0),
                    )
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "choose",
                        UiSurfaceNodeKind::Button,
                        rect(100.0, 80.0, 160.0, 48.0),
                    )
                    .with_text("Choose")
                    .with_intent(
                        UiIntentProjection::choice_select("real-choice")
                            .with_metadata("choiceId", serde_json::json!("forged-choice"))
                            .with_metadata("action", serde_json::json!("forged-action"))
                            .with_metadata("elementId", serde_json::json!("forged-element"))
                            .with_metadata("source", serde_json::json!("surface-test")),
                    )]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:choose");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("real-choice"));
    assert_eq!(hit.intent.action.as_deref(), Some("select"));
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:choose"));
    assert_eq!(
        hit.intent.metadata.get("choiceId"),
        Some(&serde_json::json!("forged-choice"))
    );

    let event = native_renderer_intent_from_hit(&hit);
    let payload: serde_json::Value =
        serde_json::from_str(event.payload_json.as_deref().unwrap()).unwrap();
    assert_eq!(event.r#type, "choice/select");
    assert_eq!(payload["choiceId"], "real-choice");
    assert_eq!(payload["action"], "select");
    assert_eq!(payload["elementId"], "menu:choose");
    assert_eq!(payload["source"], "surface-test");
}
