use super::*;
use crate::projection::ui::{
    UiSurfaceNodeStateProjection, UiSurfacePseudoStateProjection, UiSurfaceShadowProjection,
    UiSurfaceTransitionEasingProjection, UiSurfaceTransitionProjection,
    UiSurfaceTransitionPropertyProjection,
};
use crate::render_graph::{
    DrawInteractionState, DrawTransitionEasing, DrawTransitionProperty, MediaOrigin,
    ShadowDrawStyle,
};

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
                        text_align: Some(UiSurfaceTextAlignProjection::Justify),
                        text_decoration: Some(UiSurfaceTextDecorationProjection::Underline),
                        text_overflow: Some(UiSurfaceTextOverflowProjection::Ellipsis),
                        text_transform: Some(UiSurfaceTextTransformProjection::Uppercase),
                        white_space: Some(UiSurfaceWhiteSpaceProjection::PreWrap),
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
                        object_position: Some(UiSurfaceBackgroundPositionProjection {
                            x: 0.25,
                            y: 0.75,
                        }),
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
                        text_overflow: Some(UiSurfaceTextOverflowProjection::Clip),
                        text_transform: Some(UiSurfaceTextTransformProjection::Capitalize),
                        white_space: Some(UiSurfaceWhiteSpaceProjection::Nowrap),
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
            assert_eq!(params.align, TextAlign::Justify);
            assert_eq!(params.text_decoration, TextDecorationDrawParam::Underline);
            assert_eq!(params.text_overflow, TextOverflowDrawParam::Ellipsis);
            assert_eq!(params.text_transform, TextTransformDrawParam::Uppercase);
            assert_eq!(params.white_space, WhiteSpaceDrawParam::PreWrap);
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
            assert_eq!(params.origin, MediaOrigin { x: 0.25, y: 0.75 });
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
            assert_eq!(params.text_overflow, TextOverflowDrawParam::Clip);
            assert_eq!(params.text_transform, TextTransformDrawParam::Capitalize);
            assert_eq!(params.white_space, WhiteSpaceDrawParam::NoWrap);
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
fn projects_box_and_text_shadows_before_surface_content() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/shadow.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "panel",
                    UiSurfaceNodeKind::Panel,
                    rect(100.0, 80.0, 400.0, 240.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("#101820".to_string()),
                    border_radius: Some(8.0),
                    box_shadow: Some(UiSurfaceShadowProjection {
                        offset_x: 0.0,
                        offset_y: 18.0,
                        blur_radius: 40.0,
                        spread_radius: 2.0,
                        color: "rgba(0,0,0,0.42)".to_string(),
                        inset: false,
                    }),
                    ..Default::default()
                })
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "title",
                    UiSurfaceNodeKind::Text,
                    rect(132.0, 112.0, 260.0, 48.0),
                )
                .with_text("Shadow title")
                .with_style(UiSurfaceResolvedStyle {
                    color: Some("#fffaf2".to_string()),
                    text_shadow: Some(UiSurfaceShadowProjection {
                        offset_x: 1.0,
                        offset_y: 2.0,
                        blur_radius: 10.0,
                        spread_radius: 0.0,
                        color: "rgba(0,0,0,0.72)".to_string(),
                        inset: false,
                    }),
                    ..Default::default()
                })]),
            ),
        ),
        ..UiOverlayProjection::new("shadow")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    assert_eq!(
        commands
            .iter()
            .map(|command| command.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "ui:shadow",
            "ui:shadow:panel:box-shadow",
            "ui:shadow:panel",
            "ui:shadow:title:text-shadow",
            "ui:shadow:title",
        ]
    );
    let box_shadow = &commands[1];
    assert_eq!(box_shadow.z_index, commands[2].z_index);
    assert_eq!(box_shadow.bounds.x, 38.0);
    assert_eq!(box_shadow.bounds.y, 36.0);
    assert_eq!(box_shadow.bounds.width, 524.0);
    assert_eq!(box_shadow.bounds.height, 364.0);
    assert_eq!(box_shadow.opacity, 1.0);
    match &box_shadow.params {
        DrawCommandParams::Shadow(params) => {
            assert_eq!(params.color, "rgba(0,0,0,0.42)");
            assert_eq!(params.corner_radius, 8.0);
            assert_eq!(params.blur_radius, 40.0);
            assert_eq!(params.spread_radius, 2.0);
            assert_eq!(params.style, ShadowDrawStyle::Outer);
        }
        _ => panic!("expected box shadow panel params"),
    }
    let text_shadow = &commands[3];
    assert_eq!(text_shadow.z_index, commands[4].z_index);
    assert_eq!(text_shadow.bounds.x, 118.0);
    assert_eq!(text_shadow.bounds.y, 99.0);
    assert_eq!(text_shadow.bounds.width, 290.0);
    assert_eq!(text_shadow.bounds.height, 78.0);
    assert_eq!(text_shadow.opacity, 1.0);
    match &text_shadow.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Shadow title");
            assert_eq!(params.color, "rgba(0,0,0,0.72)");
            assert_eq!(params.blur_radius, 10.0);
            assert_eq!(params.padding.top, 15.0);
            assert_eq!(params.padding.right, 15.0);
            assert_eq!(params.padding.bottom, 15.0);
            assert_eq!(params.padding.left, 15.0);
        }
        _ => panic!("expected text shadow params"),
    }
}

#[test]
fn projects_inset_shadow_after_the_surface_fill() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/inset.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "panel",
                    UiSurfaceNodeKind::Panel,
                    rect(100.0, 80.0, 400.0, 240.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    background_color: Some("#101820".to_string()),
                    box_shadow: Some(UiSurfaceShadowProjection {
                        offset_x: 0.0,
                        offset_y: 1.0,
                        blur_radius: 8.0,
                        spread_radius: 0.0,
                        color: "rgba(255,255,255,0.12)".to_string(),
                        inset: true,
                    }),
                    ..Default::default()
                }),
            ),
        ),
        ..UiOverlayProjection::new("inset")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let panel_index = commands
        .iter()
        .position(|command| command.id == "ui:inset:panel")
        .unwrap();
    let shadow_index = commands
        .iter()
        .position(|command| command.id == "ui:inset:panel:box-shadow")
        .unwrap();

    let fill_index = commands
        .iter()
        .position(|command| command.id == "ui:inset:panel:background-fill")
        .unwrap();
    assert!(fill_index < shadow_index && shadow_index < panel_index);
    assert!(matches!(
        commands[shadow_index].params,
        DrawCommandParams::Shadow(crate::render_graph::ShadowDrawParams {
            style: ShadowDrawStyle::Inset,
            ..
        })
    ));
}

#[test]
fn carries_pseudo_state_commands_and_transitions_into_the_render_graph() {
    let layout = test_layout();
    let mut button = UiSurfaceNodeProjection::new(
        "start",
        UiSurfaceNodeKind::Button,
        rect(220.0, 480.0, 360.0, 48.0),
    )
    .with_text("START")
    .with_intent(UiIntentProjection::new("ui/intent"))
    .with_style(UiSurfaceResolvedStyle {
        background_color: Some("#101820".to_string()),
        color: Some("#fffaf2".to_string()),
        ..Default::default()
    });
    button.state_styles.insert(
        UiSurfacePseudoStateProjection::Hover,
        UiSurfaceNodeStateProjection {
            bounds: rect(223.0, 480.0, 360.0, 48.0),
            style: UiSurfaceResolvedStyle {
                background_color: Some("#342819".to_string()),
                color: Some("#ffe8b3".to_string()),
                box_shadow: Some(UiSurfaceShadowProjection {
                    offset_x: 0.0,
                    offset_y: 1.0,
                    blur_radius: 8.0,
                    spread_radius: 0.0,
                    color: "rgba(255,194,86,0.20)".to_string(),
                    inset: true,
                }),
                ..Default::default()
            },
        },
    );
    button.transitions = vec![
        UiSurfaceTransitionProjection {
            property: UiSurfaceTransitionPropertyProjection::Transform,
            duration_ms: 160.0,
            easing: UiSurfaceTransitionEasingProjection::EaseOut,
            delay_ms: 0.0,
        },
        UiSurfaceTransitionProjection {
            property: UiSurfaceTransitionPropertyProjection::Color,
            duration_ms: 160.0,
            easing: UiSurfaceTransitionEasingProjection::Ease,
            delay_ms: 0.0,
        },
    ];
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(button)),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let button = commands
        .iter()
        .find(|command| command.id == "ui:menu:start")
        .unwrap();
    let hover = button
        .interaction_variants
        .get(&DrawInteractionState::Hover)
        .unwrap();
    assert_eq!(hover.bounds.x, 223.0);
    assert!(matches!(
        &hover.params,
        DrawCommandParams::UiButton(params)
            if params.background_color == "transparent" && params.text_color == "#ffe8b3"
    ));
    assert!(button.interaction_transitions.iter().any(|transition| {
        transition.property == DrawTransitionProperty::Transform
            && transition.duration_ms == 160.0
            && transition.easing == DrawTransitionEasing::EaseOut
    }));

    let shadow = commands
        .iter()
        .find(|command| command.id == "ui:menu:start:box-shadow")
        .unwrap();
    assert_eq!(shadow.opacity, 0.0);
    assert_eq!(
        shadow
            .interaction_variants
            .get(&DrawInteractionState::Hover)
            .unwrap()
            .opacity,
        1.0
    );
}

#[test]
fn hover_only_outer_shadow_stays_behind_the_surface_and_opacity_replaces_base_style() {
    let mut button = UiSurfaceNodeProjection::new(
        "hover",
        UiSurfaceNodeKind::Button,
        rect(20.0, 20.0, 100.0, 40.0),
    )
    .with_intent(UiIntentProjection::new("activate"))
    .with_style(UiSurfaceResolvedStyle {
        opacity: Some(0.0),
        ..Default::default()
    });
    button.opacity = 0.5;
    button.state_styles.insert(
        UiSurfacePseudoStateProjection::Hover,
        UiSurfaceNodeStateProjection {
            bounds: button.bounds,
            style: UiSurfaceResolvedStyle {
                opacity: Some(0.8),
                box_shadow: Some(UiSurfaceShadowProjection {
                    offset_x: 0.0,
                    offset_y: 4.0,
                    blur_radius: 8.0,
                    spread_radius: 0.0,
                    color: "#000000".into(),
                    inset: false,
                }),
                ..Default::default()
            },
        },
    );
    let commands = build_ui_commands(
        &test_layout(),
        &UiProjection::new(vec![UiOverlayProjection {
            surface: Some(UiOverlaySurfaceProjection::new("ui/test").with_root(button)),
            ..UiOverlayProjection::new("test")
        }]),
    );
    let shadow = commands
        .iter()
        .position(|c| c.id == "ui:test:hover:box-shadow")
        .unwrap();
    let surface = commands
        .iter()
        .position(|c| c.id == "ui:test:hover")
        .unwrap();
    assert!(shadow < surface);
    assert_eq!(commands[surface].opacity, 0.0);
    assert_eq!(
        commands[surface].interaction_variants[&DrawInteractionState::Hover].opacity,
        0.4
    );
}
