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
                        UiSurfaceNodeProjection {
                            style: UiSurfaceResolvedStyle {
                                object_fit: Some(UiSurfaceObjectFitProjection::Cover),
                                object_position: Some(UiSurfaceBackgroundPositionProjection {
                                    x: 1.0,
                                    y: 0.0,
                                }),
                                ..UiSurfaceResolvedStyle::default()
                            },
                            ..UiSurfaceNodeProjection::new(
                                "poster",
                                UiSurfaceNodeKind::Image,
                                rect(48.0, 108.0, 180.0, 120.0),
                            )
                            .with_image(UiSurfaceImageProjection::new("ui/poster.png"))
                        },
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
    match &commands[3].params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.fit, MediaFit::Cover);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.0);
        }
        _ => panic!("expected image params"),
    }
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
fn projects_foundational_ui_components_without_structural_commands() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/composite.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "fragment",
                    UiSurfaceNodeKind::Fragment,
                    rect(0.0, 0.0, 0.0, 0.0),
                )
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "stack",
                    UiSurfaceNodeKind::Stack,
                    rect(0.0, 0.0, 800.0, 450.0),
                )
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "backdrop",
                        UiSurfaceNodeKind::Backdrop,
                        rect(0.0, 0.0, 800.0, 450.0),
                    )
                    .with_intent(UiIntentProjection::new("close")),
                    UiSurfaceNodeProjection::new(
                        "row",
                        UiSurfaceNodeKind::Row,
                        rect(24.0, 32.0, 560.0, 96.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "box",
                            UiSurfaceNodeKind::Box,
                            rect(24.0, 32.0, 96.0, 96.0),
                        ),
                        UiSurfaceNodeProjection::new(
                            "panel",
                            UiSurfaceNodeKind::Panel,
                            rect(136.0, 32.0, 320.0, 96.0),
                        )
                        .with_children(vec![UiSurfaceNodeProjection::new(
                            "panel-title",
                            UiSurfaceNodeKind::Text,
                            rect(156.0, 52.0, 260.0, 36.0),
                        )
                        .with_text("Composite")]),
                    ]),
                    UiSurfaceNodeProjection::new(
                        "column",
                        UiSurfaceNodeKind::Column,
                        rect(24.0, 144.0, 296.0, 128.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "divider",
                            UiSurfaceNodeKind::Divider,
                            rect(24.0, 144.0, 296.0, 2.0),
                        ),
                        UiSurfaceNodeProjection::new(
                            "rich",
                            UiSurfaceNodeKind::RichText,
                            rect(24.0, 160.0, 296.0, 72.0),
                        )
                        .with_text("Ready"),
                    ]),
                    UiSurfaceNodeProjection::new(
                        "grid",
                        UiSurfaceNodeKind::Grid,
                        rect(360.0, 144.0, 320.0, 176.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "poster",
                            UiSurfaceNodeKind::Image,
                            rect(360.0, 144.0, 88.0, 88.0),
                        )
                        .with_image(UiSurfaceImageProjection::new("ui/poster.png")),
                        UiSurfaceNodeProjection {
                            scroll_offset_y: 12.0,
                            ..UiSurfaceNodeProjection::new(
                                "scroll",
                                UiSurfaceNodeKind::Scroll,
                                rect(456.0, 144.0, 224.0, 120.0),
                            )
                        }
                        .with_children(vec![UiSurfaceNodeProjection::new(
                            "scroll-text",
                            UiSurfaceNodeKind::Text,
                            rect(472.0, 168.0, 184.0, 36.0),
                        )
                        .with_text("Scrolled")]),
                    ]),
                    UiSurfaceNodeProjection::new(
                        "safe",
                        UiSurfaceNodeKind::SafeArea,
                        rect(40.0, 304.0, 360.0, 80.0),
                    )
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "safe-label",
                        UiSurfaceNodeKind::Text,
                        rect(56.0, 320.0, 240.0, 36.0),
                    )
                    .with_text("Safe")]),
                    UiSurfaceNodeProjection {
                        z_index: 500,
                        ..UiSurfaceNodeProjection::new(
                            "layer",
                            UiSurfaceNodeKind::Layer,
                            rect(0.0, 0.0, 0.0, 0.0),
                        )
                    }
                    .with_children(vec![UiSurfaceNodeProjection {
                        z_index: 8,
                        ..UiSurfaceNodeProjection::new(
                            "floating",
                            UiSurfaceNodeKind::Button,
                            rect(520.0, 320.0, 128.0, 48.0),
                        )
                    }
                    .with_text("OK")
                    .with_intent(UiIntentProjection::new("confirm"))]),
                    UiSurfaceNodeProjection::new(
                        "spacer",
                        UiSurfaceNodeKind::Spacer,
                        rect(0.0, 0.0, 24.0, 24.0),
                    ),
                ])]),
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
            "ui:menu:backdrop",
            "ui:menu:box",
            "ui:menu:panel",
            "ui:menu:panel-title",
            "ui:menu:divider",
            "ui:menu:rich",
            "ui:menu:poster",
            "ui:menu:scroll",
            "ui:menu:scroll:clip-start",
            "ui:menu:scroll-text",
            "ui:menu:scroll:clip-end",
            "ui:menu:safe-label",
            "ui:menu:floating"
        ]
    );
    for structural_id in [
        "ui:menu:fragment",
        "ui:menu:stack",
        "ui:menu:row",
        "ui:menu:column",
        "ui:menu:grid",
        "ui:menu:safe",
        "ui:menu:layer",
        "ui:menu:spacer",
    ] {
        assert!(!ids.contains(&structural_id));
    }

    macro_rules! command {
        ($id:expr) => {
            commands
                .iter()
                .find(|command| command.id == $id)
                .unwrap_or_else(|| panic!("missing command {}", $id))
        };
    }

    for (id, kind) in [
        ("ui:menu:backdrop", DrawCommandKind::RoundedRect),
        ("ui:menu:box", DrawCommandKind::RoundedRect),
        ("ui:menu:panel", DrawCommandKind::RoundedRect),
        ("ui:menu:panel-title", DrawCommandKind::Text),
        ("ui:menu:divider", DrawCommandKind::RoundedRect),
        ("ui:menu:rich", DrawCommandKind::RichText),
        ("ui:menu:poster", DrawCommandKind::Image),
        ("ui:menu:scroll", DrawCommandKind::RoundedRect),
        ("ui:menu:scroll:clip-start", DrawCommandKind::ClipStart),
        ("ui:menu:scroll-text", DrawCommandKind::Text),
        ("ui:menu:scroll:clip-end", DrawCommandKind::ClipEnd),
        ("ui:menu:safe-label", DrawCommandKind::Text),
        ("ui:menu:floating", DrawCommandKind::UiSurface),
    ] {
        assert_eq!(command!(id).kind, kind, "{id}");
    }

    for (id, role) in [
        ("ui:menu:backdrop", "ui-backdrop"),
        ("ui:menu:box", "ui-box"),
        ("ui:menu:panel", "ui-panel"),
        ("ui:menu:divider", "ui-divider"),
        ("ui:menu:scroll", "ui-scroll"),
    ] {
        match &command!(id).params {
            DrawCommandParams::Panel(params) => assert_eq!(params.role, role),
            _ => panic!("expected panel params for {id}"),
        }
    }

    match &command!("ui:menu:rich").params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Ready");
            assert_eq!(params.role, "ui-rich-text");
        }
        _ => panic!("expected rich text params"),
    }

    assert_eq!(
        command!("ui:menu:poster").resource_ids,
        vec![ResourceId::from("images:ui/poster.png")]
    );

    let scroll_bounds = LogicalRect {
        x: 456.0,
        y: 144.0,
        width: 224.0,
        height: 120.0,
    };
    assert_eq!(command!("ui:menu:scroll:clip-start").bounds, scroll_bounds);
    assert_eq!(
        command!("ui:menu:scroll-text").clip_bounds,
        vec![scroll_bounds]
    );
    assert_eq!(
        command!("ui:menu:scroll-text").bounds,
        LogicalRect {
            x: 472.0,
            y: 156.0,
            width: 184.0,
            height: 36.0,
        }
    );
    assert_eq!(command!("ui:menu:scroll:clip-end").bounds, scroll_bounds);

    let safe_bounds = LogicalRect {
        x: 40.0,
        y: 304.0,
        width: 360.0,
        height: 80.0,
    };
    assert_eq!(
        command!("ui:menu:safe-label").clip_bounds,
        vec![safe_bounds]
    );

    let floating = command!("ui:menu:floating");
    assert!(floating.interactive);
    assert!(floating.z_index > command!("ui:menu:panel").z_index);
    match &floating.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "OK");
            assert_eq!(params.role, "ui-button");
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("menu:floating"));
            assert_eq!(intent.action.as_deref(), Some("confirm"));
        }
        _ => panic!("expected ui button params"),
    }
}

#[test]
fn draws_per_side_border_edges_and_suppresses_shader_border() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "box",
                    UiSurfaceNodeKind::Box,
                    rect(100.0, 100.0, 200.0, 40.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    border_color: Some("#ffffff".to_string()),
                    border_width: Some(2.0),
                    border_bottom_color: Some("#ff0000".to_string()),
                    border_bottom_width: Some(1.0),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let find = |id: &str| {
        commands
            .iter()
            .find(|command| command.id == id)
            .unwrap_or_else(|| panic!("missing command {id}"))
    };

    // The uniform shader border is suppressed while per-side edges are drawn.
    match &find("ui:menu:box").params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.border.width, 0.0);
            assert_eq!(params.border.color, None);
        }
        _ => panic!("expected panel params"),
    }

    let edge = |id: &str| {
        let command = find(id);
        assert_eq!(command.kind, DrawCommandKind::RoundedRect);
        match &command.params {
            DrawCommandParams::Panel(params) => {
                assert_eq!(params.role, "ui-border-edge");
                (command.bounds, params.fill_color.clone())
            }
            _ => panic!("expected panel params for {id}"),
        }
    };

    assert_eq!(
        edge("ui:menu:box:border-top"),
        (
            LogicalRect {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 2.0,
            },
            "#ffffff".to_string()
        )
    );
    assert_eq!(
        edge("ui:menu:box:border-right"),
        (
            LogicalRect {
                x: 298.0,
                y: 100.0,
                width: 2.0,
                height: 40.0,
            },
            "#ffffff".to_string()
        )
    );
    assert_eq!(
        edge("ui:menu:box:border-bottom"),
        (
            LogicalRect {
                x: 100.0,
                y: 139.0,
                width: 200.0,
                height: 1.0,
            },
            "#ff0000".to_string()
        )
    );
    assert_eq!(
        edge("ui:menu:box:border-left"),
        (
            LogicalRect {
                x: 100.0,
                y: 100.0,
                width: 2.0,
                height: 40.0,
            },
            "#ffffff".to_string()
        )
    );
}

#[test]
fn skips_border_edges_without_color_or_with_border_style_none() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Fragment,
                    rect(0.0, 0.0, 0.0, 0.0),
                )
                .with_children(vec![
                    // Width without any color paints nothing.
                    UiSurfaceNodeProjection::new(
                        "no-color",
                        UiSurfaceNodeKind::Box,
                        rect(0.0, 0.0, 100.0, 40.0),
                    )
                    .with_style(UiSurfaceResolvedStyle {
                        border_bottom_width: Some(1.0),
                        ..Default::default()
                    }),
                    // border-style: none suppresses every edge.
                    UiSurfaceNodeProjection::new(
                        "style-none",
                        UiSurfaceNodeKind::Box,
                        rect(0.0, 48.0, 100.0, 40.0),
                    )
                    .with_style(UiSurfaceResolvedStyle {
                        border_color: Some("#ffffff".to_string()),
                        border_style: Some(UiSurfaceBorderStyleProjection::None),
                        border_bottom_color: Some("#ff0000".to_string()),
                        border_bottom_width: Some(1.0),
                        ..Default::default()
                    }),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let edge_commands = commands
        .iter()
        .filter(|command| command.id.contains(":border-"))
        .count();
    assert_eq!(edge_commands, 0);
}
