use super::*;

#[test]
fn expands_inline_ui_surface_nodes_to_screen_commands() {
    let layout = test_layout();
    let ui = UiProjection {
        overlays: vec![UiOverlayProjection {
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Box,
                        rect(10.0, 20.0, 500.0, 320.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "title",
                            UiSurfaceNodeKind::Text,
                            rect(40.0, 48.0, 240.0, 44.0),
                        )
                        .with_text("Main Menu"),
                        UiSurfaceNodeProjection::new(
                            "poster",
                            UiSurfaceNodeKind::Image,
                            rect(48.0, 108.0, 180.0, 120.0),
                        )
                        .with_image(UiSurfaceImageProjection::new("ui/poster.png")),
                        UiSurfaceNodeProjection::new(
                            "close",
                            UiSurfaceNodeKind::Button,
                            rect(360.0, 260.0, 96.0, 44.0),
                        )
                        .with_text("Close")
                        .with_intent(UiIntentProjection::new("close")),
                        UiSurfaceNodeProjection {
                            visible: false,
                            ..UiSurfaceNodeProjection::new(
                                "hidden",
                                UiSurfaceNodeKind::Text,
                                rect(0.0, 0.0, 10.0, 10.0),
                            )
                        },
                    ]),
                ),
            ),
            provenance: provenance("runtime.menu", ["runtime.ui"]),
            ..UiOverlayProjection::new("menu")
        }],
        ..Default::default()
    };

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
            "ui:menu:poster",
            "ui:menu:close"
        ]
    );

    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(commands[1].kind, DrawCommandKind::RoundedRect);
    assert_eq!(commands[2].kind, DrawCommandKind::Text);
    assert_eq!(commands[3].kind, DrawCommandKind::Image);
    assert_eq!(
        commands[3].resource_ids,
        vec![ResourceId::from("images:ui/poster.png")]
    );
    assert_eq!(commands[4].kind, DrawCommandKind::UiSurface);
    assert!(commands[4].interactive);
    assert_eq!(commands[4].plane, RenderPlane::Screen);
    assert!(commands[4].z_index > commands[0].z_index);
    assert!(!commands[4].required_package_ids.contains("ui/menu.qui"));

    match &commands[4].params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Close");
            assert_eq!(params.role, "ui-button");
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("menu:close"));
            assert_eq!(intent.action.as_deref(), Some("close"));
        }
        _ => panic!("expected ui button params"),
    }
}

#[test]
fn projects_surface_background_image_as_package_image_command() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("#101820".to_string()),
                    background_image: Some(UiSurfaceImageProjection::new("ui/panel.png")),
                    background_position: Some(UiSurfaceBackgroundPositionProjection {
                        x: 1.0,
                        y: 0.0,
                    }),
                    background_size: Some(UiSurfaceObjectFitProjection::Contain),
                    opacity: Some(0.5),
                    ..Default::default()
                }),
            ),
        ),
        provenance: provenance("runtime.menu", ["runtime.ui"]),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        vec!["ui:menu", "ui:menu:root:background-image", "ui:menu:root"]
    );

    let image = &commands[1];
    let panel = &commands[2];
    assert_eq!(image.kind, DrawCommandKind::Image);
    assert_eq!(image.plane, RenderPlane::Screen);
    assert_eq!(image.z_index, panel.z_index - 1);
    assert_eq!(image.bounds, panel.bounds);
    assert!((image.opacity - 0.5).abs() < 0.0001);
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("images:ui/panel.png")]
    );
    assert_eq!(image.owner_package_id.as_deref(), Some("runtime.menu"));
    assert!(image.required_package_ids.contains("runtime.ui"));

    match &image.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/panel.png");
            assert_eq!(params.fit, MediaFit::Contain);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.0);
            assert_eq!(
                params.source,
                LogicalRect {
                    x: 0.0,
                    y: 0.0,
                    width: 520.0,
                    height: 320.0,
                }
            );
        }
        _ => panic!("expected background image params"),
    }
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.fill_color, "#101820");
            assert_eq!(params.role, "ui-box");
        }
        _ => panic!("expected panel params"),
    }
}
