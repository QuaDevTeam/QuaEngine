use super::super::{provenance, rect, test_layout};
use crate::input::resolve_renderer_intent_at;
use crate::projection::common::FontWeightProjection;
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceObjectFitProjection, UiSurfaceResolvedStyle,
    UiSurfaceTextAlignProjection,
};
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, FontWeightDrawParam, MediaFit, RenderGraph, RenderPlane,
    TextAlign,
};
use crate::resources::ResourceId;

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
fn maps_resolved_qss_style_to_inline_surface_node_draw_params() {
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
                    border_radius: Some(14.0),
                    border_color: Some("#5ac8fa".to_string()),
                    border_width: Some(2.0),
                    ..Default::default()
                })
                .with_children(vec![
                    UiSurfaceNodeProjection::new(
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(32.0, 32.0, 220.0, 48.0),
                    )
                    .with_text("Styled")
                    .with_style(UiSurfaceResolvedStyle {
                        color: Some("#f7f3e8".to_string()),
                        font_size: Some(34.0),
                        font_weight: Some(FontWeightProjection::number(650)),
                        line_height: Some(44.0),
                        text_align: Some(UiSurfaceTextAlignProjection::Center),
                        ..Default::default()
                    }),
                    UiSurfaceNodeProjection::new(
                        "poster",
                        UiSurfaceNodeKind::Image,
                        rect(40.0, 96.0, 180.0, 112.0),
                    )
                    .with_image(UiSurfaceImageProjection::new("ui/poster.png"))
                    .with_style(UiSurfaceResolvedStyle {
                        object_fit: Some(UiSurfaceObjectFitProjection::Cover),
                        ..Default::default()
                    }),
                    UiSurfaceNodeProjection::new(
                        "confirm",
                        UiSurfaceNodeKind::Button,
                        rect(340.0, 236.0, 120.0, 48.0),
                    )
                    .with_text("OK")
                    .with_intent(UiIntentProjection::new("confirm"))
                    .with_style(UiSurfaceResolvedStyle {
                        background_color: Some("#f0c15a".to_string()),
                        color: Some("#18130a".to_string()),
                        border_radius: Some(10.0),
                        border_color: Some("#382400".to_string()),
                        border_width: Some(1.5),
                        font_weight: Some(FontWeightProjection::keyword("bold")),
                        ..Default::default()
                    }),
                ]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    match &commands[1].params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.fill_color, "#101820");
            assert_eq!(params.corner_radius, 14.0);
            assert_eq!(params.border.color.as_deref(), Some("#5ac8fa"));
            assert_eq!(params.border.width, 2.0);
        }
        _ => panic!("expected panel params"),
    }
    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Styled");
            assert_eq!(params.color, "#f7f3e8");
            assert_eq!(params.font_size, 34.0);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Number(650))
            );
            assert_eq!(params.line_height, 44.0);
            assert_eq!(params.align, TextAlign::Center);
        }
        _ => panic!("expected text params"),
    }
    match &commands[3].params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.fit, MediaFit::Cover);
        }
        _ => panic!("expected image params"),
    }
    match &commands[4].params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "OK");
            assert_eq!(params.background_color, "#f0c15a");
            assert_eq!(params.text_color, "#18130a");
            assert_eq!(params.corner_radius, 10.0);
            assert_eq!(params.border.color.as_deref(), Some("#382400"));
            assert_eq!(params.border.width, 1.5);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("bold".to_string()))
            );
        }
        _ => panic!("expected ui button params"),
    }
}

#[test]
fn appends_ui_commands_to_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![
            UiOverlayProjection::new("menu").with_surface("ui/menu.qui")
        ]),
    );

    assert_eq!(graph.commands()[0].id, "ui:menu");
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Screen].command_count,
        1
    );
    assert_eq!(graph.summary().interactive_count, 1);
}

#[test]
fn resolves_inline_ui_surface_button_intent_from_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Box,
                        rect(0.0, 0.0, 400.0, 260.0),
                    )
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "settings",
                        UiSurfaceNodeKind::Button,
                        rect(100.0, 80.0, 160.0, 48.0),
                    )
                    .with_text("Settings")
                    .with_intent(UiIntentProjection::new("open-settings"))]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }]),
    );

    let hit = resolve_renderer_intent_at(&graph, 120.0, 96.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:settings");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:settings"));
    assert_eq!(hit.intent.action.as_deref(), Some("open-settings"));
}
