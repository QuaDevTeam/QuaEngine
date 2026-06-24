use super::super::{rect, test_layout};
use crate::input::resolve_renderer_intent_at;
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderGraph};

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

#[test]
fn expands_backdrop_surface_nodes_to_intent_panels() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "backdrop",
                    UiSurfaceNodeKind::Backdrop,
                    rect(0.0, 0.0, 1920.0, 1080.0),
                )
                .with_intent(UiIntentProjection::new("close"))
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("rgba(0,0,0,0.64)".to_string()),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[1];

    assert_eq!(command.id, "ui:dialog:backdrop");
    assert_eq!(command.kind, DrawCommandKind::RoundedRect);
    assert!(command.interactive);
    match &command.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-backdrop");
            assert_eq!(params.fill_color, "rgba(0,0,0,0.64)");
            assert_eq!(params.corner_radius, 0.0);
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("dialog:backdrop"));
            assert_eq!(intent.action.as_deref(), Some("close"));
        }
        _ => panic!("expected backdrop panel params"),
    }
}

#[test]
fn backdrop_surface_intent_resolves_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "backdrop",
                        UiSurfaceNodeKind::Backdrop,
                        rect(0.0, 0.0, 1920.0, 1080.0),
                    )
                    .with_intent(UiIntentProjection::new("close")),
                ),
            ),
            ..UiOverlayProjection::new("dialog")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:dialog:backdrop");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("dialog:backdrop"));
    assert_eq!(hit.intent.action.as_deref(), Some("close"));
}

#[test]
fn expands_panel_surface_nodes_to_semantic_panels() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "panel",
                    UiSurfaceNodeKind::Panel,
                    rect(120.0, 96.0, 560.0, 320.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("#101820".to_string()),
                    border_radius: Some(18.0),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[1];

    assert_eq!(command.id, "ui:dialog:panel");
    assert_eq!(command.kind, DrawCommandKind::RoundedRect);
    assert!(!command.interactive);
    match &command.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-panel");
            assert_eq!(params.fill_color, "#101820");
            assert_eq!(params.corner_radius, 18.0);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected panel params"),
    }
}

#[test]
fn panel_surface_intent_resolves_from_graph_when_declared() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "resume",
                        UiSurfaceNodeKind::Panel,
                        rect(80.0, 80.0, 260.0, 120.0),
                    )
                    .with_intent(UiIntentProjection::new("resume")),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:resume");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:resume"));
    assert_eq!(hit.intent.action.as_deref(), Some("resume"));
}
