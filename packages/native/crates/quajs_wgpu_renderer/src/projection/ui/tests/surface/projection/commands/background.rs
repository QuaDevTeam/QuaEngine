use super::*;
use crate::projection::ui::types::UiSurfaceGradientStopProjection;

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
        vec![
            "ui:menu",
            "ui:menu:root:background-fill",
            "ui:menu:root:background-image",
            "ui:menu:root"
        ]
    );

    let image = &commands[2];
    let panel = &commands[3];
    assert_eq!(image.kind, DrawCommandKind::Image);
    assert_eq!(image.plane, RenderPlane::Screen);
    assert_eq!(image.z_index, panel.z_index);
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
    assert!(
        matches!(&commands[1].params, DrawCommandParams::Panel(p) if p.fill_color == "#101820")
    );
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.fill_color, "transparent");
            assert_eq!(params.role, "ui-box");
        }
        _ => panic!("expected panel params"),
    }
}

#[test]
fn projects_surface_gradient_in_the_same_stable_paint_layer_as_the_surface() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/gradient.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(20.0, 30.0, 320.0, 180.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_gradient: Some(UiSurfaceGradientProjection {
                        kind: UiSurfaceGradientKindProjection::Linear,
                        angle_degrees: Some(90.0),
                        center_x: None,
                        center_y: None,
                        radius: None,
                        shape: None,
                        stops: vec![
                            UiSurfaceGradientStopProjection {
                                color: "rgba(5,7,12,0.82)".to_string(),
                                position: 0.0,
                            },
                            UiSurfaceGradientStopProjection {
                                color: "rgba(12,18,28,0.42)".to_string(),
                                position: 0.4,
                            },
                            UiSurfaceGradientStopProjection {
                                color: "rgba(5,7,12,0.06)".to_string(),
                                position: 1.0,
                            },
                        ],
                    }),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("gradient")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    assert_eq!(
        commands
            .iter()
            .map(|command| command.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "ui:gradient",
            "ui:gradient:root:background-fill",
            "ui:gradient:root:background-gradient",
            "ui:gradient:root:background-gradient-1",
            "ui:gradient:root",
        ]
    );
    let first_gradient = &commands[2];
    let second_gradient = &commands[3];
    let surface = &commands[4];
    assert_eq!(first_gradient.z_index, surface.z_index);
    assert_eq!(second_gradient.z_index, surface.z_index);
    match &first_gradient.params {
        DrawCommandParams::Gradient(params) => {
            assert_eq!(params.kind, GradientDrawKind::Linear);
            assert_eq!(params.start_color, "rgba(5,7,12,0.82)");
            assert_eq!(params.end_color, "rgba(12,18,28,0.42)");
            assert_eq!(params.angle_degrees, 90.0);
            assert_eq!(params.start_offset, 0.0);
            assert_eq!(params.end_offset, 0.4);
            assert!(params.fill_before_start);
            assert!(!params.fill_after_end);
        }
        _ => panic!("expected gradient params"),
    }
    match &second_gradient.params {
        DrawCommandParams::Gradient(params) => {
            assert_eq!(params.start_color, "rgba(12,18,28,0.42)");
            assert_eq!(params.end_color, "rgba(5,7,12,0.06)");
            assert_eq!(params.start_offset, 0.4);
            assert_eq!(params.end_offset, 1.0);
            assert!(!params.fill_before_start);
            assert!(params.fill_after_end);
        }
        _ => panic!("expected gradient params"),
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
        vec![
            "ui:menu",
            "ui:menu:root:background-fill",
            "ui:menu:root:background-image",
            "ui:menu:root"
        ]
    );
    let image = &commands[2];
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
