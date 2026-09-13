use super::*;

#[test]
fn skips_inline_surface_nodes_with_unsafe_ids_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "bad/path",
                        UiSurfaceNodeKind::Text,
                        rect(24.0, 24.0, 200.0, 48.0),
                    )
                    .with_text("Path"),
                    UiSurfaceNodeProjection::new(
                        "native:open",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 96.0, 160.0, 48.0),
                    )
                    .with_text("Native")
                    .with_intent(UiIntentProjection::new("open")),
                    UiSurfaceNodeProjection::new(
                        "plugin.dll",
                        UiSurfaceNodeKind::Image,
                        rect(24.0, 168.0, 120.0, 80.0),
                    )
                    .with_image(UiSurfaceImageProjection::new("ui/poster.png")),
                    UiSurfaceNodeProjection::new(
                        "safe:node",
                        UiSurfaceNodeKind::Text,
                        rect(240.0, 24.0, 200.0, 48.0),
                    )
                    .with_text("Safe"),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu", "ui:menu:root", "ui:menu:safe:node"]);
}

#[test]
fn skips_duplicate_inline_surface_node_ids_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "duplicate",
                        UiSurfaceNodeKind::Text,
                        rect(24.0, 24.0, 200.0, 48.0),
                    )
                    .with_text("First"),
                    UiSurfaceNodeProjection::new(
                        "duplicate",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 96.0, 200.0, 48.0),
                    )
                    .with_text("Second")
                    .with_intent(UiIntentProjection::new("open"))
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "duplicate-child",
                        UiSurfaceNodeKind::Text,
                        rect(32.0, 160.0, 160.0, 32.0),
                    )
                    .with_text("Nested")]),
                    UiSurfaceNodeProjection::new(
                        "unique",
                        UiSurfaceNodeKind::Text,
                        rect(240.0, 24.0, 200.0, 48.0),
                    )
                    .with_text("Unique"),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        vec![
            "ui:menu",
            "ui:menu:root",
            "ui:menu:duplicate",
            "ui:menu:unique"
        ]
    );
    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "First");
        }
        _ => panic!("expected text params for first duplicate node"),
    }
}

#[test]
fn drops_inline_surface_intents_with_unsafe_dispatch_ids() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "unsafe-action",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 24.0, 200.0, 48.0),
                    )
                    .with_text("Unsafe")
                    .with_intent(UiIntentProjection::new("native:open")),
                    UiSurfaceNodeProjection::new(
                        "safe-action",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 96.0, 200.0, 48.0),
                    )
                    .with_text("Safe")
                    .with_intent(
                        UiIntentProjection::new("open")
                            .with_metadata("safe:key", serde_json::json!("kept"))
                            .with_metadata("bad/key", serde_json::json!("dropped")),
                    ),
                    UiSurfaceNodeProjection::new(
                        "unsafe-choice",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 168.0, 200.0, 48.0),
                    )
                    .with_text("Choice")
                    .with_intent(UiIntentProjection::choice_select("bad/choice")),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let unsafe_action = commands
        .iter()
        .find(|command| command.id == "ui:menu:unsafe-action")
        .expect("unsafe action button command should still render");
    let safe_action = commands
        .iter()
        .find(|command| command.id == "ui:menu:safe-action")
        .expect("safe action button command should render");
    let unsafe_choice = commands
        .iter()
        .find(|command| command.id == "ui:menu:unsafe-choice")
        .expect("unsafe choice button command should still render");

    match &unsafe_action.params {
        DrawCommandParams::UiButton(params) => {
            assert!(!params.enabled);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected ui button params"),
    }
    match &safe_action.params {
        DrawCommandParams::UiButton(params) => {
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.action.as_deref(), Some("open"));
            assert!(intent.metadata.contains_key("safe:key"));
            assert!(!intent.metadata.contains_key("bad/key"));
        }
        _ => panic!("expected ui button params"),
    }
    match &unsafe_choice.params {
        DrawCommandParams::UiButton(params) => {
            assert!(!params.enabled);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected ui button params"),
    }
}
