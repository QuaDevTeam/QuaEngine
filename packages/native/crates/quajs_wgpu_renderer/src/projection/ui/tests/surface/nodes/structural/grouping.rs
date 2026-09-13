use super::*;

#[test]
fn expands_fragment_surface_nodes_without_draw_commands() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "group",
                    UiSurfaceNodeKind::Fragment,
                    rect(0.0, 0.0, 0.0, 0.0),
                )
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(40.0, 48.0, 240.0, 44.0),
                    )
                    .with_text("Grouped"),
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

    assert_eq!(ids, vec!["ui:menu", "ui:menu:title", "ui:menu:confirm"]);
    assert_eq!(commands[1].kind, DrawCommandKind::Text);
    assert_eq!(commands[2].kind, DrawCommandKind::UiSurface);
    assert!(commands[2].interactive);
}

#[test]
fn expands_layout_group_surface_nodes_without_draw_commands() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/layout.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "stack",
                    UiSurfaceNodeKind::Stack,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_intent(UiIntentProjection::new("ignored-stack"))
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "row",
                        UiSurfaceNodeKind::Row,
                        rect(0.0, 0.0, 520.0, 120.0),
                    )
                    .with_intent(UiIntentProjection::new("ignored-row"))
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(40.0, 48.0, 240.0, 44.0),
                    )
                    .with_text("Layout")]),
                    UiSurfaceNodeProjection::new(
                        "column",
                        UiSurfaceNodeKind::Column,
                        rect(0.0, 120.0, 260.0, 200.0),
                    )
                    .with_intent(UiIntentProjection::new("ignored-column"))
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "confirm",
                        UiSurfaceNodeKind::Button,
                        rect(40.0, 160.0, 120.0, 48.0),
                    )
                    .with_text("OK")
                    .with_intent(UiIntentProjection::new("confirm"))]),
                    UiSurfaceNodeProjection::new(
                        "grid",
                        UiSurfaceNodeKind::Grid,
                        rect(260.0, 120.0, 260.0, 200.0),
                    )
                    .with_intent(UiIntentProjection::new("ignored-grid"))
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "icon",
                        UiSurfaceNodeKind::Image,
                        rect(300.0, 160.0, 48.0, 48.0),
                    )
                    .with_image(UiSurfaceImageProjection::new("ui/icon.png"))]),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("layout")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        vec![
            "ui:layout",
            "ui:layout:title",
            "ui:layout:confirm",
            "ui:layout:icon"
        ]
    );
    assert!(commands.iter().all(|command| {
        !matches!(
            command.id.as_str(),
            "ui:layout:stack" | "ui:layout:row" | "ui:layout:column" | "ui:layout:grid"
        )
    }));
    assert_eq!(commands[1].kind, DrawCommandKind::Text);
    assert_eq!(commands[2].kind, DrawCommandKind::UiSurface);
    assert!(commands[2].interactive);
    assert_eq!(commands[3].kind, DrawCommandKind::Image);
}
