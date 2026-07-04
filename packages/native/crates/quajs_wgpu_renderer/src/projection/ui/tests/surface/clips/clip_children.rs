use super::*;

#[test]
fn painted_surface_clip_children_adds_child_clip_bounds() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection {
                    clip_children: true,
                    ..UiSurfaceNodeProjection::new(
                        "panel",
                        UiSurfaceNodeKind::Panel,
                        rect(40.0, 40.0, 220.0, 90.0),
                    )
                }
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
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let panel_bounds = LogicalRect {
        x: 40.0,
        y: 40.0,
        width: 220.0,
        height: 90.0,
    };

    assert_eq!(commands[1].id, "ui:menu:panel");
    assert_eq!(commands[1].clip_bounds, Vec::<LogicalRect>::new());
    assert_eq!(commands[2].id, "ui:menu:inside");
    assert_eq!(commands[2].clip_bounds, vec![panel_bounds]);
}

#[test]
fn painted_surface_clip_children_filters_button_intents() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection {
                        clip_children: true,
                        ..UiSurfaceNodeProjection::new(
                            "panel",
                            UiSurfaceNodeKind::Panel,
                            rect(40.0, 40.0, 220.0, 90.0),
                        )
                    }
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

#[test]
fn structural_surface_clip_children_adds_child_clip_bounds_without_draw_command() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection {
                    clip_children: true,
                    ..UiSurfaceNodeProjection::new(
                        "row",
                        UiSurfaceNodeKind::Row,
                        rect(40.0, 40.0, 220.0, 90.0),
                    )
                }
                .with_intent(UiIntentProjection::new("ignored"))
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
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let row_bounds = LogicalRect {
        x: 40.0,
        y: 40.0,
        width: 220.0,
        height: 90.0,
    };

    assert!(commands.iter().all(|command| command.id != "ui:menu:row"));
    assert_eq!(commands[1].id, "ui:menu:inside");
    assert_eq!(commands[1].clip_bounds, vec![row_bounds]);
}

#[test]
fn structural_surface_clip_children_filters_button_intents() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection {
                        clip_children: true,
                        ..UiSurfaceNodeProjection::new(
                            "row",
                            UiSurfaceNodeKind::Row,
                            rect(40.0, 40.0, 220.0, 90.0),
                        )
                    }
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
