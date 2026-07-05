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
fn projects_inline_image_params_and_custom_asset_type() {
    let layout = test_layout();
    let mut poster = UiSurfaceNodeProjection::new(
        "poster",
        UiSurfaceNodeKind::Image,
        rect(48.0, 108.0, 180.0, 120.0),
    )
    .with_image(UiSurfaceImageProjection {
        asset_type: "sprites".to_string(),
        asset_name: "ui/poster.png".to_string(),
    })
    .with_style(UiSurfaceResolvedStyle {
        object_fit: Some(UiSurfaceObjectFitProjection::ScaleDown),
        ..Default::default()
    });
    poster.provenance = provenance("runtime.poster", ["runtime.ui"]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(poster)),
        provenance: provenance("runtime.menu", ["runtime.ui"]),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands.len(), 2);
    let image = &commands[1];
    assert_eq!(image.id, "ui:menu:poster");
    assert_eq!(image.kind, DrawCommandKind::Image);
    assert_eq!(image.plane, RenderPlane::Screen);
    assert_eq!(
        image.bounds,
        LogicalRect {
            x: 48.0,
            y: 108.0,
            width: 180.0,
            height: 120.0,
        }
    );
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("sprites:ui/poster.png")]
    );
    assert_eq!(image.owner_package_id.as_deref(), Some("runtime.poster"));
    assert!(image.required_package_ids.contains("runtime.ui"));

    match &image.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "sprites");
            assert_eq!(params.asset_name, "ui/poster.png");
            assert_eq!(params.fit, MediaFit::ScaleDown);
            assert_eq!(params.origin.x, 0.5);
            assert_eq!(params.origin.y, 0.5);
            assert_eq!(params.source, image.bounds);
            assert_eq!(params.rotation_degrees, 0.0);
        }
        _ => panic!("expected image params"),
    }
}

#[test]
fn skips_unsafe_inline_surface_node_package_provenance() {
    let layout = test_layout();
    let mut poster = UiSurfaceNodeProjection::new(
        "poster",
        UiSurfaceNodeKind::Image,
        rect(48.0, 108.0, 180.0, 120.0),
    )
    .with_image(UiSurfaceImageProjection::new("ui/poster.png"));
    poster.provenance = provenance("runtime/poster", ["runtime.ui", "../bad"]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(poster)),
        provenance: provenance("runtime.menu", ["base.ui"]),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let image = &commands[1];

    assert_eq!(image.owner_package_id.as_deref(), Some("runtime.menu"));
    assert!(image.required_package_ids.contains("base.ui"));
    assert!(image.required_package_ids.contains("runtime.ui"));
    assert!(!image.required_package_ids.contains("../bad"));
    assert!(!image.required_package_ids.contains("runtime/poster"));
}

#[test]
fn skips_inline_image_nodes_without_resolved_asset() {
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
                        "missing",
                        UiSurfaceNodeKind::Image,
                        rect(48.0, 108.0, 180.0, 120.0),
                    ),
                    UiSurfaceNodeProjection::new(
                        "blank",
                        UiSurfaceNodeKind::Image,
                        rect(240.0, 108.0, 180.0, 120.0),
                    )
                    .with_image(UiSurfaceImageProjection {
                        asset_type: "images".to_string(),
                        asset_name: " ".to_string(),
                    }),
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

    assert_eq!(ids, vec!["ui:menu", "ui:menu:root"]);
    assert!(commands
        .iter()
        .all(|command| command.kind != DrawCommandKind::Image));
}

#[test]
fn skips_inline_image_nodes_with_unsafe_asset_type() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "poster",
                    UiSurfaceNodeKind::Image,
                    rect(48.0, 108.0, 180.0, 120.0),
                )
                .with_image(UiSurfaceImageProjection {
                    asset_type: "sprites/native".to_string(),
                    asset_name: "ui/poster.png".to_string(),
                }),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu"]);
    assert!(commands
        .iter()
        .all(|command| command.kind != DrawCommandKind::Image));
}

#[test]
fn skips_inline_image_nodes_with_unsafe_asset_names() {
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
                        "url",
                        UiSurfaceNodeKind::Image,
                        rect(48.0, 108.0, 180.0, 120.0),
                    )
                    .with_image(UiSurfaceImageProjection {
                        asset_type: "images".to_string(),
                        asset_name: "https://example.test/poster.png".to_string(),
                    }),
                    UiSurfaceNodeProjection::new(
                        "traversal",
                        UiSurfaceNodeKind::Image,
                        rect(240.0, 108.0, 180.0, 120.0),
                    )
                    .with_image(UiSurfaceImageProjection {
                        asset_type: "images".to_string(),
                        asset_name: "../poster.png".to_string(),
                    }),
                    UiSurfaceNodeProjection::new(
                        "payload",
                        UiSurfaceNodeKind::Image,
                        rect(432.0, 108.0, 180.0, 120.0),
                    )
                    .with_image(UiSurfaceImageProjection {
                        asset_type: "images".to_string(),
                        asset_name: "ui/native.wasm#rev".to_string(),
                    }),
                    UiSurfaceNodeProjection::new(
                        "valid",
                        UiSurfaceNodeKind::Image,
                        rect(624.0, 108.0, 180.0, 120.0),
                    )
                    .with_image(UiSurfaceImageProjection::new("ui/poster.png")),
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

    assert_eq!(ids, vec!["ui:menu", "ui:menu:root", "ui:menu:valid"]);
    assert_eq!(
        commands[2].resource_ids,
        vec![ResourceId::from("images:ui/poster.png")]
    );
}

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

#[test]
fn projects_surface_background_image_custom_asset_type_and_node_provenance() {
    let layout = test_layout();
    let mut root = UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Panel,
        rect(32.0, 48.0, 640.0, 360.0),
    )
    .with_style(UiSurfaceResolvedStyle {
        background_image: Some(UiSurfaceImageProjection {
            asset_type: "sprites".to_string(),
            asset_name: "skins/night/menu-panel.png".to_string(),
        }),
        background_position: Some(UiSurfaceBackgroundPositionProjection { x: 0.25, y: 0.75 }),
        background_size: Some(UiSurfaceObjectFitProjection::ScaleDown),
        ..Default::default()
    });
    root.provenance = provenance("runtime.skin", ["runtime.menu"]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(root)),
        provenance: provenance("runtime.menu", ["base.ui"]),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(
        commands
            .iter()
            .map(|command| command.id.as_str())
            .collect::<Vec<_>>(),
        vec!["ui:menu", "ui:menu:root:background-image", "ui:menu:root"]
    );
    let image = &commands[1];
    assert_eq!(image.kind, DrawCommandKind::Image);
    assert_eq!(image.owner_package_id.as_deref(), Some("runtime.skin"));
    assert!(image.required_package_ids.contains("base.ui"));
    assert!(image.required_package_ids.contains("runtime.menu"));
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("sprites:skins/night/menu-panel.png")]
    );

    match &image.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "sprites");
            assert_eq!(params.asset_name, "skins/night/menu-panel.png");
            assert_eq!(params.fit, MediaFit::ScaleDown);
            assert_eq!(params.origin.x, 0.25);
            assert_eq!(params.origin.y, 0.75);
            assert_eq!(params.source, image.bounds);
        }
        _ => panic!("expected background image params"),
    }
}

#[test]
fn skips_surface_background_image_with_unsafe_asset_type() {
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
                    background_image: Some(UiSurfaceImageProjection {
                        asset_type: "../images".to_string(),
                        asset_name: "ui/panel.png".to_string(),
                    }),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu", "ui:menu:root"]);
    assert!(commands
        .iter()
        .all(|command| command.id != "ui:menu:root:background-image"));
}

#[test]
fn skips_surface_background_image_with_unsafe_asset_name() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Panel,
                    rect(0.0, 0.0, 520.0, 320.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_image: Some(UiSurfaceImageProjection {
                        asset_type: "images".to_string(),
                        asset_name: "ui/native.dll?rev=1".to_string(),
                    }),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu", "ui:menu:root"]);
    assert!(commands
        .iter()
        .all(|command| command.id != "ui:menu:root:background-image"));
}
