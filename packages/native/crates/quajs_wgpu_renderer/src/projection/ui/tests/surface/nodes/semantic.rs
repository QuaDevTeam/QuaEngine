use super::*;

#[test]
fn expands_backdrop_surface_nodes_to_intent_panels() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "backdrop",
                    UiSurfaceNodeKind::Backdrop,
                    rect(0.0, 0.0, 1920.0, 1080.0),
                )
                .with_intent(UiIntentProjection::new("close"))
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("rgba(0,0,0,0.64)".to_string()),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[1];

    assert_eq!(command.id, "ui:dialog:backdrop");
    assert_eq!(command.kind, DrawCommandKind::RoundedRect);
    assert!(command.interactive);
    match &command.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-backdrop");
            assert_eq!(params.fill_color, "rgba(0,0,0,0.64)");
            assert_eq!(params.corner_radius, 0.0);
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("dialog:backdrop"));
            assert_eq!(intent.action.as_deref(), Some("close"));
        }
        _ => panic!("expected backdrop panel params"),
    }
}

#[test]
fn backdrop_surface_intent_resolves_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "backdrop",
                        UiSurfaceNodeKind::Backdrop,
                        rect(0.0, 0.0, 1920.0, 1080.0),
                    )
                    .with_intent(UiIntentProjection::new("close")),
                ),
            ),
            ..UiOverlayProjection::new("dialog")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:dialog:backdrop");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("dialog:backdrop"));
    assert_eq!(hit.intent.action.as_deref(), Some("close"));
}

#[test]
fn expands_panel_surface_nodes_to_semantic_panels() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "panel",
                    UiSurfaceNodeKind::Panel,
                    rect(120.0, 96.0, 560.0, 320.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("#101820".to_string()),
                    border_radius: Some(18.0),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[1];

    assert_eq!(command.id, "ui:dialog:panel");
    assert_eq!(command.kind, DrawCommandKind::RoundedRect);
    assert!(!command.interactive);
    match &command.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-panel");
            assert_eq!(params.fill_color, "#101820");
            assert_eq!(params.corner_radius, 18.0);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected panel params"),
    }
}

#[test]
fn panel_surface_intent_resolves_from_graph_when_declared() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "resume",
                        UiSurfaceNodeKind::Panel,
                        rect(80.0, 80.0, 260.0, 120.0),
                    )
                    .with_intent(UiIntentProjection::new("resume")),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:resume");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:resume"));
    assert_eq!(hit.intent.action.as_deref(), Some("resume"));
}
