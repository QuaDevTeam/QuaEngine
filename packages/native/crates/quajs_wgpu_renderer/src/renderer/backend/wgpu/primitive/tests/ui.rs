use super::*;

#[test]
fn scales_analytic_shadow_metrics_and_source_box_to_physical_pixels() {
    let plan =
        WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan_with_physical_scale(
            vec![WgpuNativeRenderExecutionOperation::Draw {
                command_id: "ui:panel:box-shadow".to_string(),
                pipeline: DrawBatchPipeline::Shape,
                kind: DrawCommandKind::RoundedRect,
                metadata: draw_metadata(DrawCommandParams::Shadow(ShadowDrawParams {
                    role: "ui-box-shadow".to_string(),
                    source_bounds: LogicalRect {
                        x: 14.0,
                        y: 26.0,
                        width: 100.0,
                        height: 30.0,
                    },
                    offset_x: 2.0,
                    offset_y: 3.0,
                    blur_radius: 12.0,
                    spread_radius: -2.0,
                    corner_radius: 8.0,
                    color: "rgba(0,0,0,0.4)".to_string(),
                    style: ShadowDrawStyle::Inset,
                })),
                physical_bounds: physical_rect(20, 40, 240, 72),
                clip_depth: 0,
                resource_count: 0,
            }],
            2.0,
        ));

    assert!(matches!(
        &plan.passes[0].primitives[0].kind,
        WgpuNativeRenderPrimitiveKind::Shadow {
            source_offset_x,
            source_offset_y,
            source_width,
            source_height,
            offset_x,
            offset_y,
            blur_radius,
            spread_radius,
            corner_radius,
            inset,
            ..
        } if *source_offset_x == 8.0
            && *source_offset_y == 12.0
            && *source_width == 200.0
            && *source_height == 60.0
            && *offset_x == 4.0
            && *offset_y == 6.0
            && *blur_radius == 24.0
            && *spread_radius == -4.0
            && *corner_radius == 16.0
            && *inset
    ));
}

#[test]
fn scales_ui_paint_and_typography_metrics_to_physical_pixels() {
    let plan =
        WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan_with_physical_scale(
            vec![
                WgpuNativeRenderExecutionOperation::Draw {
                    command_id: "ui:panel".to_string(),
                    pipeline: DrawBatchPipeline::Shape,
                    kind: DrawCommandKind::RoundedRect,
                    metadata: draw_metadata(DrawCommandParams::Panel(PanelDrawParams {
                        role: "panel".to_string(),
                        rotation_degrees: 0.0,
                        corner_radius: 8.0,
                        fill_color: "#000000".to_string(),
                        border: BorderDrawParams {
                            color: Some("#ffffff".to_string()),
                            width: 1.5,
                        },
                        padding: EdgeInsetsDrawParam::default(),
                        intent: None,
                    })),
                    physical_bounds: physical_rect(0, 0, 640, 360),
                    clip_depth: 0,
                    resource_count: 0,
                },
                WgpuNativeRenderExecutionOperation::Draw {
                    command_id: "ui:text".to_string(),
                    pipeline: DrawBatchPipeline::Text,
                    kind: DrawCommandKind::Text,
                    metadata: draw_metadata(DrawCommandParams::Text(TextDrawParams {
                        inline: None,
                        text: "DPR".to_string(),
                        font_family: Vec::new(),
                        font_size: 24.0,
                        font_style: FontStyleDrawParam::Normal,
                        font_weight: None,
                        letter_spacing: 1.0,
                        line_height: 30.0,
                        align: TextAlign::Left,
                        text_decoration: TextDecorationDrawParam::None,
                        text_overflow: TextOverflowDrawParam::Clip,
                        text_transform: TextTransformDrawParam::None,
                        white_space: WhiteSpaceDrawParam::Normal,
                        color: "#ffffff".to_string(),
                        blur_radius: 0.0,
                        padding: EdgeInsetsDrawParam {
                            top: 2.0,
                            right: 4.0,
                            bottom: 2.0,
                            left: 4.0,
                        },
                        role: "text".to_string(),
                        rotation_degrees: 0.0,
                    })),
                    physical_bounds: physical_rect(20, 20, 200, 80),
                    clip_depth: 0,
                    resource_count: 0,
                },
            ],
            2.0,
        ));

    assert!(matches!(
        &plan.passes[0].primitives[0].kind,
        WgpuNativeRenderPrimitiveKind::Panel { corner_radius, border, .. }
            if *corner_radius == 16.0 && border.width == 3.0
    ));
    assert!(matches!(
        &plan.passes[0].primitives[1].kind,
        WgpuNativeRenderPrimitiveKind::Text { style, .. }
            if style.font_size == 48.0
                && style.letter_spacing == 2.0
                && style.line_height == 60.0
                && style.padding == (EdgeInsetsDrawParam {
                    top: 4.0,
                    right: 8.0,
                    bottom: 4.0,
                    left: 8.0,
                })
    ));
}

#[test]
fn lowers_foundational_ui_surface_primitives() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:panel".to_string(),
            pipeline: DrawBatchPipeline::Shape,
            kind: DrawCommandKind::RoundedRect,
            metadata: draw_metadata(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-panel".to_string(),
                rotation_degrees: 0.0,
                corner_radius: 12.0,
                fill_color: "rgba(16,24,32,0.75)".to_string(),
                border: BorderDrawParams {
                    color: Some("#5ac8fa".to_string()),
                    width: 1.5,
                },
                padding: EdgeInsetsDrawParam {
                    top: 10.0,
                    right: 14.0,
                    bottom: 10.0,
                    left: 14.0,
                },
                intent: None,
            })),
            physical_bounds: physical_rect(40, 48, 320, 180),
            clip_depth: 0,
            resource_count: 0,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:title".to_string(),
            pipeline: DrawBatchPipeline::Text,
            kind: DrawCommandKind::Text,
            metadata: draw_metadata(DrawCommandParams::Text(TextDrawParams {
                inline: None,
                text: "Menu".to_string(),
                font_family: vec!["Inter".to_string(), "Noto Sans".to_string()],
                font_size: 24.0,
                font_style: FontStyleDrawParam::Italic,
                font_weight: None,
                letter_spacing: 0.5,
                line_height: 30.0,
                align: TextAlign::Justify,
                text_decoration: TextDecorationDrawParam::Underline,
                text_overflow: TextOverflowDrawParam::Ellipsis,
                text_transform: TextTransformDrawParam::Uppercase,
                white_space: WhiteSpaceDrawParam::NoWrap,
                color: "#ffffff".to_string(),
                blur_radius: 0.0,
                padding: EdgeInsetsDrawParam {
                    top: 2.0,
                    right: 4.0,
                    bottom: 2.0,
                    left: 4.0,
                },
                role: "ui-text".to_string(),
                rotation_degrees: 0.0,
            })),
            physical_bounds: physical_rect(56, 64, 288, 36),
            clip_depth: 0,
            resource_count: 2,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            metadata: draw_metadata(DrawCommandParams::UiSurface(UiSurfaceDrawParams {
                element_id: "menu".to_string(),
                surface_key: Some("ui/menu.qui".to_string()),
                render_mode: "inline".to_string(),
                overlay_stack: "menu".to_string(),
                interactive: true,
                intent: None,
            })),
            physical_bounds: physical_rect(40, 48, 320, 180),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    assert_eq!(plan.primitive_count, 3);

    let panel = &plan.passes[0].primitives[0];
    assert!(matches!(
        &panel.kind,
        WgpuNativeRenderPrimitiveKind::Panel {
            fill_color,
            corner_radius,
            border,
            ..
        } if fill_color == "rgba(16,24,32,0.75)"
            && *corner_radius == 12.0
            && border.color.as_deref() == Some("#5ac8fa")
            && border.width == 1.5
    ));
    assert!(panel.resource_ids.is_empty());

    let text = &plan.passes[0].primitives[1];
    assert!(matches!(
        &text.kind,
        WgpuNativeRenderPrimitiveKind::Text {
            text,
            color,
            style,
            ..
        } if text == "Menu"
            && color == "#ffffff"
            && style.font_family == vec!["Inter".to_string(), "Noto Sans".to_string()]
            && style.font_size == 24.0
            && style.font_style == FontStyleDrawParam::Italic
            && style.letter_spacing == 0.5
            && style.line_height == 30.0
            && style.align == TextAlign::Justify
            && style.text_decoration == TextDecorationDrawParam::Underline
            && style.text_overflow == TextOverflowDrawParam::Ellipsis
            && style.text_transform == TextTransformDrawParam::Uppercase
            && style.white_space == WhiteSpaceDrawParam::NoWrap
            && style.padding == (EdgeInsetsDrawParam {
                top: 2.0,
                right: 4.0,
                bottom: 2.0,
                left: 4.0,
            })
    ));
    assert_eq!(
        text.resource_ids,
        vec![
            ResourceId::from("fonts:Inter"),
            ResourceId::from("fonts:Noto Sans"),
        ]
    );

    let surface = &plan.passes[0].primitives[2];
    assert!(matches!(
        &surface.kind,
        WgpuNativeRenderPrimitiveKind::UiSurface {
            element_id,
            surface_key,
            interactive,
        } if element_id == "menu"
            && surface_key.as_deref() == Some("ui/menu.qui")
            && *interactive
    ));
    assert_eq!(
        surface.resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
}

#[test]
fn lowers_rich_text_draws_into_text_primitives_without_losing_draw_kind() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:rich-body".to_string(),
            pipeline: DrawBatchPipeline::Text,
            kind: DrawCommandKind::RichText,
            metadata: draw_metadata(DrawCommandParams::Text(TextDrawParams {
                inline: None,
                text: "First line\nSecond line".to_string(),
                font_family: vec!["Qua Serif".to_string(), "Fallback Serif".to_string()],
                font_size: 22.0,
                font_style: FontStyleDrawParam::Normal,
                font_weight: None,
                letter_spacing: 0.0,
                line_height: 30.0,
                align: TextAlign::Left,
                text_decoration: TextDecorationDrawParam::None,
                text_overflow: TextOverflowDrawParam::Clip,
                text_transform: TextTransformDrawParam::None,
                white_space: WhiteSpaceDrawParam::PreLine,
                color: "#f7f3e8".to_string(),
                blur_radius: 0.0,
                padding: EdgeInsetsDrawParam {
                    top: 4.0,
                    right: 6.0,
                    bottom: 8.0,
                    left: 6.0,
                },
                role: "ui-rich-text".to_string(),
                rotation_degrees: 0.0,
            })),
            physical_bounds: physical_rect(64, 128, 360, 96),
            clip_depth: 0,
            resource_count: 2,
        },
    ]));

    let rich_text = &plan.passes[0].primitives[0];

    assert_eq!(rich_text.draw_kind, DrawCommandKind::RichText);
    assert!(matches!(
        &rich_text.kind,
        WgpuNativeRenderPrimitiveKind::Text { text, color, style, .. }
            if text == "First line\nSecond line"
                && color == "#f7f3e8"
                && style.font_family == vec![
                    "Qua Serif".to_string(),
                    "Fallback Serif".to_string(),
                ]
                && style.font_size == 22.0
                && style.line_height == 30.0
                && style.white_space == WhiteSpaceDrawParam::PreLine
                && style.padding == (EdgeInsetsDrawParam {
                    top: 4.0,
                    right: 6.0,
                    bottom: 8.0,
                    left: 6.0,
                })
    ));
    assert_eq!(
        rich_text.resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Serif"),
        ]
    );
}
