use super::*;

#[test]
fn expands_layer_surface_nodes_as_z_groups_without_draw_commands() {
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
                    UiSurfaceNodeProjection {
                        z_index: 20,
                        ..UiSurfaceNodeProjection::new(
                            "title",
                            UiSurfaceNodeKind::Text,
                            rect(40.0, 48.0, 240.0, 44.0),
                        )
                    }
                    .with_text("Layered"),
                    UiSurfaceNodeProjection {
                        z_index: 60,
                        ..UiSurfaceNodeProjection::new(
                            "foreground",
                            UiSurfaceNodeKind::Layer,
                            rect(0.0, 0.0, 0.0, 0.0),
                        )
                    }
                    .with_intent(UiIntentProjection::new("ignored"))
                    .with_children(vec![UiSurfaceNodeProjection {
                        z_index: 5,
                        ..UiSurfaceNodeProjection::new(
                            "confirm",
                            UiSurfaceNodeKind::Button,
                            rect(340.0, 236.0, 120.0, 48.0),
                        )
                    }
                    .with_text("OK")
                    .with_intent(UiIntentProjection::new("confirm"))]),
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
    assert!(commands
        .iter()
        .all(|command| command.id != "ui:menu:foreground"));
    assert_eq!(commands[2].kind, DrawCommandKind::Text);
    assert_eq!(commands[3].kind, DrawCommandKind::UiSurface);
    assert!(commands[3].z_index > commands[2].z_index);
    assert!(commands[3].interactive);
}
