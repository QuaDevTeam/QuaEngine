use super::*;

#[test]
fn expands_safe_area_surface_nodes_to_child_clip_bounds() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "safe",
                    UiSurfaceNodeKind::SafeArea,
                    rect(100.0, 80.0, 360.0, 180.0),
                )
                .with_intent(UiIntentProjection::new("ignored"))
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(120.0, 96.0, 280.0, 44.0),
                    )
                    .with_text("Safe"),
                    UiSurfaceNodeProjection::new(
                        "confirm",
                        UiSurfaceNodeKind::Button,
                        rect(340.0, 236.0, 120.0, 48.0),
                    )
                    .with_text("OK")
                    .with_intent(UiIntentProjection::new("confirm")),
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
    let safe_bounds = LogicalRect {
        x: 100.0,
        y: 80.0,
        width: 360.0,
        height: 180.0,
    };

    assert_eq!(ids, vec!["ui:menu", "ui:menu:title", "ui:menu:confirm"]);
    assert!(commands.iter().all(|command| command.id != "ui:menu:safe"));
    assert_eq!(commands[1].kind, DrawCommandKind::Text);
    assert_eq!(commands[1].clip_bounds, vec![safe_bounds]);
    assert_eq!(commands[2].kind, DrawCommandKind::UiSurface);
    assert_eq!(commands[2].clip_bounds, vec![safe_bounds]);
    assert!(commands[2].interactive);
}

#[test]
fn safe_area_clip_bounds_filter_button_intents() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "safe",
                        UiSurfaceNodeKind::SafeArea,
                        rect(40.0, 40.0, 220.0, 90.0),
                    )
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "inside",
                        UiSurfaceNodeKind::Button,
                        rect(60.0, 60.0, 180.0, 140.0),
                    )
                    .with_text("Inside")
                    .with_intent(UiIntentProjection::new("inside"))]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 80.0, 80.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:inside");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:inside"));
    assert_eq!(hit.intent.action.as_deref(), Some("inside"));
    assert!(resolve_renderer_intent_at(&graph, 80.0, 160.0).is_none());
}
