use super::super::{provenance, rect, test_layout};
use crate::input::resolve_renderer_intent_at;
use crate::projection::common::{FontFamilyProjection, FontWeightProjection};
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceBackgroundPositionProjection,
    UiSurfaceBorderStyleProjection, UiSurfaceEdgeInsetsProjection, UiSurfaceFontStyleProjection,
    UiSurfaceImageProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection,
    UiSurfaceObjectFitProjection, UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection,
    UiSurfaceTextDecorationProjection,
};
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, FontStyleDrawParam, FontWeightDrawParam, LogicalRect,
    MediaFit, RenderGraph, RenderPlane, TextAlign, TextDecorationDrawParam,
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
                    border_style: Some(UiSurfaceBorderStyleProjection::Solid),
                    border_width: Some(2.0),
                    padding: Some(UiSurfaceEdgeInsetsProjection {
                        top: 12.0,
                        right: 18.0,
                        bottom: 20.0,
                        left: 16.0,
                    }),
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
                        font_family: Some(FontFamilyProjection::new([
                            "Qua Sans",
                            "",
                            "Fallback Serif",
                        ])),
                        font_size: Some(34.0),
                        font_style: Some(UiSurfaceFontStyleProjection::Italic),
                        font_weight: Some(FontWeightProjection::number(650)),
                        letter_spacing: Some(1.5),
                        line_height: Some(44.0),
                        text_align: Some(UiSurfaceTextAlignProjection::Center),
                        text_decoration: Some(UiSurfaceTextDecorationProjection::Underline),
                        padding: Some(UiSurfaceEdgeInsetsProjection {
                            top: 2.0,
                            right: 4.0,
                            bottom: 6.0,
                            left: 8.0,
                        }),
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
                        border_style: Some(UiSurfaceBorderStyleProjection::None),
                        border_width: Some(1.5),
                        font_family: Some(FontFamilyProjection::new([
                            "Button Face",
                            "Fallback UI",
                        ])),
                        font_size: Some(30.0),
                        font_style: Some(UiSurfaceFontStyleProjection::Normal),
                        font_weight: Some(FontWeightProjection::keyword("bold")),
                        letter_spacing: Some(0.75),
                        line_height: Some(40.0),
                        text_align: Some(UiSurfaceTextAlignProjection::Right),
                        text_decoration: Some(UiSurfaceTextDecorationProjection::LineThrough),
                        padding: Some(UiSurfaceEdgeInsetsProjection {
                            top: 6.0,
                            right: 14.0,
                            bottom: 8.0,
                            left: 12.0,
                        }),
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
            assert_eq!(params.padding.top, 12.0);
            assert_eq!(params.padding.right, 18.0);
            assert_eq!(params.padding.bottom, 20.0);
            assert_eq!(params.padding.left, 16.0);
        }
        _ => panic!("expected panel params"),
    }
    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Styled");
            assert_eq!(params.color, "#f7f3e8");
            assert_eq!(params.font_family, vec!["Qua Sans", "Fallback Serif"]);
            assert_eq!(params.font_size, 34.0);
            assert_eq!(params.font_style, FontStyleDrawParam::Italic);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Number(650))
            );
            assert_eq!(params.letter_spacing, 1.5);
            assert_eq!(params.line_height, 44.0);
            assert_eq!(params.align, TextAlign::Center);
            assert_eq!(params.text_decoration, TextDecorationDrawParam::Underline);
            assert_eq!(params.padding.top, 2.0);
            assert_eq!(params.padding.right, 4.0);
            assert_eq!(params.padding.bottom, 6.0);
            assert_eq!(params.padding.left, 8.0);
        }
        _ => panic!("expected text params"),
    }
    assert_eq!(
        commands[2].resource_ids,
        vec![
            ResourceId::from("fonts:Qua Sans"),
            ResourceId::from("fonts:Fallback Serif")
        ]
    );
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
            assert_eq!(params.border.color.as_deref(), None);
            assert_eq!(params.border.width, 0.0);
            assert_eq!(params.font_family, vec!["Button Face", "Fallback UI"]);
            assert_eq!(params.font_size, 30.0);
            assert_eq!(params.font_style, FontStyleDrawParam::Normal);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("bold".to_string()))
            );
            assert_eq!(params.letter_spacing, 0.75);
            assert_eq!(params.line_height, 40.0);
            assert_eq!(params.align, TextAlign::Right);
            assert_eq!(params.text_decoration, TextDecorationDrawParam::LineThrough);
            assert_eq!(params.padding.top, 6.0);
            assert_eq!(params.padding.right, 14.0);
            assert_eq!(params.padding.bottom, 8.0);
            assert_eq!(params.padding.left, 12.0);
        }
        _ => panic!("expected ui button params"),
    }
    assert_eq!(
        commands[4].resource_ids,
        vec![
            ResourceId::from("fonts:Button Face"),
            ResourceId::from("fonts:Fallback UI")
        ]
    );
}

#[test]
fn projects_rich_text_surface_nodes_as_text_pipeline_commands() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 640.0, 240.0),
                )
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "body",
                    UiSurfaceNodeKind::RichText,
                    rect(32.0, 40.0, 560.0, 120.0),
                )
                .with_text("Native rich text")
                .with_style(UiSurfaceResolvedStyle {
                    color: Some("#fff4d6".to_string()),
                    font_family: Some(FontFamilyProjection::new(["Qua Serif", "Fallback Serif"])),
                    font_size: Some(30.0),
                    font_weight: Some(FontWeightProjection::keyword("semibold")),
                    line_height: Some(42.0),
                    text_align: Some(UiSurfaceTextAlignProjection::Left),
                    ..Default::default()
                })]),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands[2].kind, DrawCommandKind::RichText);
    assert_eq!(
        commands[2].resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Serif")
        ]
    );

    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Native rich text");
            assert_eq!(params.role, "ui-rich-text");
            assert_eq!(params.color, "#fff4d6");
            assert_eq!(params.font_family, vec!["Qua Serif", "Fallback Serif"]);
            assert_eq!(params.font_size, 30.0);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("semibold".to_string()))
            );
            assert_eq!(params.line_height, 42.0);
            assert_eq!(params.align, TextAlign::Left);
        }
        _ => panic!("expected text params for rich text command"),
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
