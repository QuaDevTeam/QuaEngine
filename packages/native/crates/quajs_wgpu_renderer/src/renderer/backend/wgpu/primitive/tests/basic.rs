use super::*;

#[test]
fn lowers_execution_draws_into_wgpu_primitives() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            metadata: draw_metadata(DrawCommandParams::UiButton(UiButtonDrawParams {
                label: "Start".to_string(),
                enabled: true,
                role: "primary".to_string(),
                background_color: "#101820".to_string(),
                text_color: "#ffffff".to_string(),
                corner_radius: 8.0,
                border: BorderDrawParams {
                    color: Some("#ffffff".to_string()),
                    width: 2.0,
                },
                font_family: vec!["Inter".to_string()],
                font_size: 18.0,
                font_style: FontStyleDrawParam::Normal,
                font_weight: None,
                letter_spacing: 0.0,
                line_height: 22.0,
                align: TextAlign::Center,
                text_decoration: TextDecorationDrawParam::None,
                text_overflow: TextOverflowDrawParam::Clip,
                text_transform: TextTransformDrawParam::None,
                white_space: WhiteSpaceDrawParam::NoWrap,
                padding: EdgeInsetsDrawParam {
                    top: 6.0,
                    right: 12.0,
                    bottom: 6.0,
                    left: 12.0,
                },
                intent: None,
            })),
            physical_bounds: physical_rect(12, 20, 240, 72),
            clip_depth: 1,
            resource_count: 0,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "background:main".to_string(),
            pipeline: DrawBatchPipeline::Image,
            kind: DrawCommandKind::Image,
            metadata: draw_metadata(DrawCommandParams::Image(ImageDrawParams {
                asset_type: "images".to_string(),
                asset_name: "bg/school.png".to_string(),
                fit: MediaFit::Cover,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                rotation_degrees: 0.0,
            })),
            physical_bounds: physical_rect(0, 0, 1280, 720),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    assert_eq!(plan.revision, 77);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.primitive_count, 2);
    assert_eq!(plan.visible_primitive_count, 2);
    assert_eq!(plan.skipped_draw_count, 0);

    let button = &plan.passes[0].primitives[0];
    assert!(button.is_visible());
    assert_eq!(button.command_id, "ui:button");
    assert_eq!(button.owner_package_id.as_deref(), Some("runtime.menu"));
    assert_eq!(button.required_package_ids, vec!["runtime.ui".to_string()]);
    assert!(matches!(
        &button.kind,
        WgpuNativeRenderPrimitiveKind::UiButton {
            label,
            enabled,
            background_color,
            text_color,
            text_style,
            corner_radius,
            border,
        } if label == "Start"
            && *enabled
            && background_color == "#101820"
            && text_color == "#ffffff"
            && text_style.font_family == vec!["Inter".to_string()]
            && text_style.font_size == 18.0
            && text_style.font_style == FontStyleDrawParam::Normal
            && text_style.font_weight.is_none()
            && text_style.letter_spacing == 0.0
            && text_style.line_height == 22.0
            && text_style.align == TextAlign::Center
            && text_style.text_decoration == TextDecorationDrawParam::None
            && text_style.text_overflow == TextOverflowDrawParam::Clip
            && text_style.text_transform == TextTransformDrawParam::None
            && text_style.white_space == WhiteSpaceDrawParam::NoWrap
            && text_style.padding == (EdgeInsetsDrawParam {
                top: 6.0,
                right: 12.0,
                bottom: 6.0,
                left: 12.0,
            })
            && *corner_radius == 8.0
            && border.color.as_deref() == Some("#ffffff")
            && border.width == 2.0
    ));

    let image = &plan.passes[0].primitives[1];
    assert!(matches!(
        &image.kind,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type,
            asset_name,
            fit,
            origin,
            source,
            rotation_degrees,
        } if asset_type == "images"
            && asset_name == "bg/school.png"
            && *fit == MediaFit::Cover
            && origin == &MediaOrigin::default()
            && source == &LogicalRect::default()
            && *rotation_degrees == 0.0
    ));
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
}

#[test]
fn empty_clip_primitives_do_not_count_as_visible_draw_work() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:scroll:clip-start".to_string(),
            pipeline: DrawBatchPipeline::Clip,
            kind: DrawCommandKind::ClipStart,
            metadata: draw_metadata(DrawCommandParams::None),
            physical_bounds: physical_rect(24, 32, 320, 180),
            clip_depth: 0,
            resource_count: 0,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:scroll:clip-end".to_string(),
            pipeline: DrawBatchPipeline::Clip,
            kind: DrawCommandKind::ClipEnd,
            metadata: draw_metadata(DrawCommandParams::None),
            physical_bounds: physical_rect(24, 32, 320, 180),
            clip_depth: 0,
            resource_count: 0,
        },
    ]));

    assert_eq!(plan.primitive_count, 2);
    assert_eq!(plan.visible_primitive_count, 0);
    assert!(plan.passes[0]
        .primitives
        .iter()
        .all(|primitive| matches!(primitive.kind, WgpuNativeRenderPrimitiveKind::Empty)));
    assert!(plan.passes[0]
        .primitives
        .iter()
        .all(|primitive| !primitive.is_visible()));
}
