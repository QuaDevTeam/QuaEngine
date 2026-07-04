use super::*;

#[test]
fn expands_divider_surface_nodes_to_visual_separators() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/settings.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "rule",
                    UiSurfaceNodeKind::Divider,
                    rect(40.0, 120.0, 360.0, 2.0),
                )
                .with_intent(UiIntentProjection::new("ignored"))
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("rgba(255,255,255,0.28)".to_string()),
                    border_radius: Some(1.0),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("settings")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[1];

    assert_eq!(command.id, "ui:settings:rule");
    assert_eq!(command.kind, DrawCommandKind::RoundedRect);
    assert!(!command.interactive);
    match &command.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-divider");
            assert_eq!(params.fill_color, "rgba(255,255,255,0.28)");
            assert_eq!(params.corner_radius, 1.0);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected divider panel params"),
    }
}

#[test]
fn skips_spacer_surface_nodes_without_draw_commands() {
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
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(40.0, 48.0, 240.0, 44.0),
                    )
                    .with_text("Spaced"),
                    UiSurfaceNodeProjection::new(
                        "gap",
                        UiSurfaceNodeKind::Spacer,
                        rect(40.0, 108.0, 240.0, 32.0),
                    )
                    .with_intent(UiIntentProjection::new("ignored")),
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

    assert_eq!(
        ids,
        vec![
            "ui:menu",
            "ui:menu:root",
            "ui:menu:title",
            "ui:menu:confirm"
        ]
    );
    assert!(commands.iter().all(|command| command.id != "ui:menu:gap"));
    assert_eq!(commands[2].kind, DrawCommandKind::Text);
    assert_eq!(commands[3].kind, DrawCommandKind::UiSurface);
    assert!(commands[3].interactive);
}
