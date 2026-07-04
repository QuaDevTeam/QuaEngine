use super::*;

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
