use super::*;

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
