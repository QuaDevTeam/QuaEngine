use crate::projection::common::FontFamilyProjection;
use crate::projection::safety::MAX_NATIVE_TEXT_PAYLOAD_BYTES;
use crate::projection::ui::{
    UiOverlaySceneProjection, UiOverlaySceneShellProjection, UiSurfaceBackgroundPositionProjection,
    UiSurfaceBorderStyleProjection, UiSurfaceEdgeInsetsProjection, UiSurfaceGradientKindProjection,
    UiSurfaceGradientProjection, UiSurfaceGradientStopProjection,
};

use super::*;

fn surface_command_count(commands: &[crate::render_graph::DrawCommand]) -> usize {
    commands
        .iter()
        .filter(|command| command.id.starts_with("ui:menu:"))
        .count()
}

#[test]
fn skips_surface_nodes_with_unsafe_resolved_numbers() {
    let layout = test_layout();
    let root = UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Fragment,
        rect(0.0, 0.0, 0.0, 0.0),
    )
    .with_children(vec![
        UiSurfaceNodeProjection::new(
            "bad-bounds",
            UiSurfaceNodeKind::Text,
            rect(20.0, 24.0, -1.0, 40.0),
        )
        .with_text("bad bounds"),
        UiSurfaceNodeProjection {
            opacity: f32::NAN,
            ..UiSurfaceNodeProjection::new(
                "bad-opacity",
                UiSurfaceNodeKind::Text,
                rect(20.0, 72.0, 160.0, 40.0),
            )
            .with_text("bad opacity")
        },
        UiSurfaceNodeProjection {
            z_index: 1_000_001,
            ..UiSurfaceNodeProjection::new(
                "bad-z",
                UiSurfaceNodeKind::Panel,
                rect(20.0, 120.0, 160.0, 40.0),
            )
        },
        UiSurfaceNodeProjection::new(
            "bad-style-number",
            UiSurfaceNodeKind::Text,
            rect(20.0, 168.0, 160.0, 40.0),
        )
        .with_text("bad style")
        .with_style(UiSurfaceResolvedStyle {
            border_width: Some(-1.0),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "bad-border-edge-width",
            UiSurfaceNodeKind::Panel,
            rect(20.0, 168.0, 160.0, 40.0),
        )
        .with_style(UiSurfaceResolvedStyle {
            border_bottom_width: Some(-1.0),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "bad-background-position",
            UiSurfaceNodeKind::Panel,
            rect(20.0, 216.0, 160.0, 40.0),
        )
        .with_style(UiSurfaceResolvedStyle {
            background_position: Some(UiSurfaceBackgroundPositionProjection { x: 1.01, y: 0.5 }),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "bad-padding",
            UiSurfaceNodeKind::Button,
            rect(20.0, 264.0, 160.0, 40.0),
        )
        .with_text("bad padding")
        .with_intent(UiIntentProjection::new("bad-padding"))
        .with_style(UiSurfaceResolvedStyle {
            padding: Some(UiSurfaceEdgeInsetsProjection {
                top: 0.0,
                right: 0.0,
                bottom: 0.0,
                left: 1_000_001.0,
            }),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "bad-gradient-stops",
            UiSurfaceNodeKind::Panel,
            rect(20.0, 312.0, 160.0, 40.0),
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
                        color: "#000".to_string(),
                        position: 0.8,
                    },
                    UiSurfaceGradientStopProjection {
                        color: "#fff".to_string(),
                        position: 0.2,
                    },
                ],
            }),
            ..Default::default()
        }),
    ]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(root)),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(surface_command_count(&commands), 0);
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "ui:menu");
}

#[test]
fn skips_surface_nodes_with_unsafe_text_payloads() {
    let layout = test_layout();
    let root = UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Fragment,
        rect(0.0, 0.0, 0.0, 0.0),
    )
    .with_children(vec![
        UiSurfaceNodeProjection::new(
            "bad-text",
            UiSurfaceNodeKind::Text,
            rect(20.0, 24.0, 240.0, 40.0),
        )
        .with_text("Open\u{1b}Menu"),
        UiSurfaceNodeProjection::new(
            "bad-button",
            UiSurfaceNodeKind::Button,
            rect(20.0, 72.0, 240.0, 56.0),
        )
        .with_text("a".repeat(MAX_NATIVE_TEXT_PAYLOAD_BYTES + 1))
        .with_intent(UiIntentProjection::new("bad-button")),
        UiSurfaceNodeProjection::new(
            "allowed-text",
            UiSurfaceNodeKind::Text,
            rect(20.0, 136.0, 320.0, 64.0),
        )
        .with_text("Line one\nLine two\tTabbed\rReturn"),
    ]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(root)),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(surface_command_count(&commands), 1);
    assert!(!commands
        .iter()
        .any(|command| command.id == "ui:menu:bad-text"));
    assert!(!commands
        .iter()
        .any(|command| command.id == "ui:menu:bad-button"));

    let allowed_text = commands
        .iter()
        .find(|command| command.id == "ui:menu:allowed-text")
        .unwrap();
    match &allowed_text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Line one\nLine two\tTabbed\rReturn");
        }
        _ => panic!("expected allowed text params"),
    }
}

#[test]
fn falls_back_from_unsafe_surface_style_strings_on_direct_projection() {
    let layout = test_layout();
    let root = UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Fragment,
        rect(0.0, 0.0, 0.0, 0.0),
    )
    .with_children(vec![
        UiSurfaceNodeProjection::new(
            "panel",
            UiSurfaceNodeKind::Panel,
            rect(20.0, 24.0, 260.0, 96.0),
        )
        .with_style(UiSurfaceResolvedStyle {
            background_color: Some("url(native.dll)".to_string()),
            border_color: Some("../theme/border".to_string()),
            border_style: Some(UiSurfaceBorderStyleProjection::Solid),
            border_width: Some(2.0),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "label",
            UiSurfaceNodeKind::Text,
            rect(32.0, 40.0, 220.0, 44.0),
        )
        .with_text("Title")
        .with_style(UiSurfaceResolvedStyle {
            color: Some("file:///theme/text".to_string()),
            font_family: Some(FontFamilyProjection::new([
                "Qua Sans",
                "../Escape Sans",
                "NativePayload.dll",
                "fonts:Injected",
            ])),
            ..Default::default()
        }),
        UiSurfaceNodeProjection::new(
            "button",
            UiSurfaceNodeKind::Button,
            rect(32.0, 96.0, 220.0, 56.0),
        )
        .with_text("Start")
        .with_intent(UiIntentProjection::new("start"))
        .with_style(UiSurfaceResolvedStyle {
            background_color: Some("https://example.test/button.png".to_string()),
            color: Some("red".to_string()),
            font_family: Some(FontFamilyProjection::new(["native:Injected"])),
            ..Default::default()
        }),
    ]);
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(root)),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(surface_command_count(&commands), 3);

    let panel = commands
        .iter()
        .find(|command| command.id == "ui:menu:panel")
        .unwrap();
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.fill_color, "rgba(0,0,0,0.0)");
            assert_eq!(params.border.color, None);
            assert_eq!(params.border.width, 2.0);
        }
        _ => panic!("expected panel params"),
    }

    let label = commands
        .iter()
        .find(|command| command.id == "ui:menu:label")
        .unwrap();
    match &label.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.color, "#ffffff");
            assert_eq!(params.font_family, vec!["Qua Sans"]);
        }
        _ => panic!("expected text params"),
    }
    assert_eq!(
        label
            .resource_ids
            .iter()
            .map(|resource| resource.as_str())
            .collect::<Vec<_>>(),
        vec!["fonts:Qua Sans"]
    );

    let button = commands
        .iter()
        .find(|command| command.id == "ui:menu:button")
        .unwrap();
    match &button.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.background_color, "rgba(0,0,0,0.0)");
            assert_eq!(params.text_color, "red");
            assert!(params.font_family.is_empty());
        }
        _ => panic!("expected button params"),
    }
    assert!(button.resource_ids.is_empty());
}

#[test]
fn skips_unsafe_group_subtree_before_inheriting_opacity() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "group",
                    UiSurfaceNodeKind::Fragment,
                    rect(0.0, 0.0, 0.0, 0.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    opacity: Some(f32::NAN),
                    ..Default::default()
                })
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "title",
                    UiSurfaceNodeKind::Text,
                    rect(40.0, 48.0, 240.0, 44.0),
                )
                .with_text("Title")]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(surface_command_count(&commands), 0);
    assert!(!commands.iter().any(|command| command.id == "ui:menu:title"));
}

#[test]
fn skips_scroll_surface_with_unsafe_offsets() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection {
                    scroll_offset_y: 1_000_001.0,
                    ..UiSurfaceNodeProjection::new(
                        "scroll",
                        UiSurfaceNodeKind::Scroll,
                        rect(20.0, 30.0, 300.0, 160.0),
                    )
                }
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "inside",
                    UiSurfaceNodeKind::Button,
                    rect(24.0, 112.0, 220.0, 56.0),
                )
                .with_text("Inside")
                .with_intent(UiIntentProjection::new("inside"))]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(surface_command_count(&commands), 0);
    assert!(!commands
        .iter()
        .any(|command| command.id == "ui:menu:scroll"));
    assert!(!commands
        .iter()
        .any(|command| command.id == "ui:menu:inside"));
}

#[test]
fn skips_ui_overlays_with_unsafe_z_order_numbers() {
    let layout = test_layout();
    let surface = Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
        UiSurfaceNodeProjection::new(
            "title",
            UiSurfaceNodeKind::Text,
            rect(40.0, 48.0, 240.0, 44.0),
        ),
    ));
    let ui = UiProjection::new(vec![
        UiOverlayProjection {
            stack_priority: Some(1_001),
            surface: surface.clone(),
            ..UiOverlayProjection::new("menu")
        },
        UiOverlayProjection {
            scene: Some(UiOverlaySceneProjection {
                id: "menu-scene".to_string(),
                overlay: Some(UiOverlaySceneShellProjection {
                    z_index: Some(1_000_001),
                    ..Default::default()
                }),
                ..UiOverlaySceneProjection::new("menu-scene")
            }),
            surface,
            ..UiOverlayProjection::new("menu-scene")
        },
    ]);

    let commands = build_ui_commands(&layout, &ui);

    assert!(commands.is_empty());
}
