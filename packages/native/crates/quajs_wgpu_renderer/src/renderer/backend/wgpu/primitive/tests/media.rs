use super::*;

#[test]
fn preserves_image_source_rect_when_lowering_primitives() {
    let source = LogicalRect {
        x: 0.25,
        y: 0.125,
        width: 0.5,
        height: 0.25,
    };
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:crop".to_string(),
            pipeline: DrawBatchPipeline::Image,
            kind: DrawCommandKind::Image,
            metadata: draw_metadata(DrawCommandParams::Image(ImageDrawParams {
                asset_type: "images".to_string(),
                asset_name: "atlas/menu.png".to_string(),
                fit: MediaFit::Contain,
                origin: MediaOrigin::default(),
                source,
                rotation_degrees: 12.5,
                brightness: 1.0,
                saturation: 1.0,
            })),
            physical_bounds: physical_rect(20, 30, 200, 100),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert!(matches!(
        &primitive.kind,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type,
            asset_name,
            fit,
            origin,
            source: primitive_source,
            rotation_degrees,
            brightness,
            saturation,
        } if asset_type == "images"
            && asset_name == "atlas/menu.png"
            && *fit == MediaFit::Contain
            && origin == &MediaOrigin::default()
            && primitive_source == &source
            && *rotation_degrees == 12.5
            && *brightness == 1.0
            && *saturation == 1.0
    ));
}

#[test]
fn skips_empty_param_resource_ids_when_no_resources_are_bound() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        unbound_draw(
            "ui:empty-image",
            DrawBatchPipeline::Image,
            DrawCommandKind::Image,
            DrawCommandParams::Image(ImageDrawParams {
                asset_type: "images".to_string(),
                asset_name: "  ".to_string(),
                fit: MediaFit::Contain,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                rotation_degrees: 0.0,
                brightness: 1.0,
                saturation: 1.0,
            }),
        ),
        unbound_draw(
            "background:empty-video",
            DrawBatchPipeline::Video,
            DrawCommandKind::VideoFrame,
            DrawCommandParams::Video(VideoDrawParams {
                asset_type: "video".to_string(),
                asset_name: "".to_string(),
                frame_resource_id: None,
                poster_asset_name: Some("".to_string()),
                looped: None,
                muted: None,
                volume: None,
                playback_rate: None,
                seek_ms: None,
                offset_ms: None,
                fit: MediaFit::Cover,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                fallback_reason: Some("decode-unavailable".to_string()),
            }),
        ),
        unbound_draw(
            "character:empty",
            DrawBatchPipeline::Character,
            DrawCommandKind::Image,
            DrawCommandParams::Character(CharacterDrawParams {
                character_id: "empty".to_string(),
                character_name: "Empty".to_string(),
                sprite_asset_name: "".to_string(),
                expression: None,
                anchor: CharacterAnchor::Center,
                scale: 1.0,
                rotation_degrees: 0.0,
            }),
        ),
        unbound_draw(
            "ui:empty-text",
            DrawBatchPipeline::Text,
            DrawCommandKind::Text,
            DrawCommandParams::Text(TextDrawParams {
                text: "Fallback".to_string(),
                font_family: vec!["  ".to_string()],
                font_size: 24.0,
                font_style: FontStyleDrawParam::Normal,
                font_weight: None,
                letter_spacing: 0.0,
                line_height: 28.0,
                align: TextAlign::Left,
                text_decoration: TextDecorationDrawParam::None,
                text_overflow: TextOverflowDrawParam::Clip,
                text_transform: TextTransformDrawParam::None,
                white_space: WhiteSpaceDrawParam::Normal,
                color: "#ffffff".to_string(),
                blur_radius: 0.0,
                padding: EdgeInsetsDrawParam::default(),
                role: "ui-text".to_string(),
            }),
        ),
        unbound_draw(
            "ui:empty-surface",
            DrawBatchPipeline::Ui,
            DrawCommandKind::UiSurface,
            DrawCommandParams::UiSurface(UiSurfaceDrawParams {
                element_id: "menu".to_string(),
                surface_key: Some("".to_string()),
                render_mode: "inline".to_string(),
                overlay_stack: "menu".to_string(),
                interactive: false,
                intent: None,
            }),
        ),
    ]));

    assert_eq!(plan.primitive_count, 5);
    assert!(plan.passes[0]
        .primitives
        .iter()
        .all(|primitive| primitive.resource_ids.is_empty()));
}

fn unbound_draw(
    command_id: &str,
    pipeline: DrawBatchPipeline,
    kind: DrawCommandKind,
    params: DrawCommandParams,
) -> WgpuNativeRenderExecutionOperation {
    WgpuNativeRenderExecutionOperation::Draw {
        command_id: command_id.to_string(),
        pipeline,
        kind,
        metadata: draw_metadata(params),
        physical_bounds: physical_rect(20, 30, 200, 100),
        clip_depth: 0,
        resource_count: 0,
    }
}

#[test]
fn lowers_video_fallback_poster_with_image_resource_namespace() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "background:video".to_string(),
            pipeline: DrawBatchPipeline::Video,
            kind: DrawCommandKind::VideoFrame,
            metadata: draw_metadata(DrawCommandParams::Video(VideoDrawParams {
                asset_type: "video".to_string(),
                asset_name: "opening.mp4".to_string(),
                frame_resource_id: None,
                poster_asset_name: Some("opening-poster.png".to_string()),
                looped: Some(true),
                muted: Some(false),
                volume: Some(0.75),
                playback_rate: Some(1.25),
                seek_ms: Some(1_200.0),
                offset_ms: Some(50.0),
                fit: MediaFit::Cover,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                fallback_reason: Some("decode-unavailable".to_string()),
            })),
            physical_bounds: physical_rect(0, 0, 1280, 720),
            clip_depth: 0,
            resource_count: 2,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert!(matches!(
        &primitive.kind,
        WgpuNativeRenderPrimitiveKind::VideoFallback {
            asset_type,
            asset_name,
            poster_asset_name,
            looped,
            muted,
            volume,
            playback_rate,
            seek_ms,
            offset_ms,
            fit,
            origin,
            source,
            fallback_reason,
        } if asset_type == "video"
            && asset_name == "opening.mp4"
            && poster_asset_name.as_deref() == Some("opening-poster.png")
            && *looped == Some(true)
            && *muted == Some(false)
            && *volume == Some(0.75)
            && *playback_rate == Some(1.25)
            && *seek_ms == Some(1_200.0)
            && *offset_ms == Some(50.0)
            && *fit == MediaFit::Cover
            && origin == &MediaOrigin::default()
            && source == &LogicalRect::default()
            && fallback_reason.as_deref() == Some("decode-unavailable")
    ));
    assert_eq!(
        primitive.resource_ids,
        vec![
            ResourceId::from("video:opening.mp4"),
            ResourceId::from("images:opening-poster.png"),
        ]
    );
}

#[test]
fn lowers_video_frame_resource_without_fallback_reason() {
    let frame_resource_id = ResourceId::from("video:texture-ring:video:opening.mp4");
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "background:video".to_string(),
            pipeline: DrawBatchPipeline::Video,
            kind: DrawCommandKind::VideoFrame,
            metadata: draw_metadata(DrawCommandParams::Video(VideoDrawParams {
                asset_type: "video".to_string(),
                asset_name: "opening.mp4".to_string(),
                frame_resource_id: Some(frame_resource_id.clone()),
                poster_asset_name: Some("opening-poster.png".to_string()),
                looped: Some(true),
                muted: Some(false),
                volume: Some(0.75),
                playback_rate: Some(1.25),
                seek_ms: Some(1_200.0),
                offset_ms: Some(50.0),
                fit: MediaFit::Cover,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                fallback_reason: None,
            })),
            physical_bounds: physical_rect(0, 0, 1280, 720),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert!(matches!(
        &primitive.kind,
        WgpuNativeRenderPrimitiveKind::VideoFrame {
            asset_type,
            asset_name,
            frame_resource_id: primitive_frame_resource_id,
            looped,
            muted,
            volume,
            playback_rate,
            seek_ms,
            offset_ms,
            fit,
            origin,
            source,
        } if asset_type == "video"
            && asset_name == "opening.mp4"
            && primitive_frame_resource_id == &frame_resource_id
            && *looped == Some(true)
            && *muted == Some(false)
            && *volume == Some(0.75)
            && *playback_rate == Some(1.25)
            && *seek_ms == Some(1_200.0)
            && *offset_ms == Some(50.0)
            && *fit == MediaFit::Cover
            && origin == &MediaOrigin::default()
            && source == &LogicalRect::default()
    ));
    assert_eq!(primitive.resource_ids, vec![frame_resource_id]);
}

#[test]
fn lowers_character_primitives_with_character_resource_namespace() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "character:yuki".to_string(),
            pipeline: DrawBatchPipeline::Character,
            kind: DrawCommandKind::Image,
            metadata: draw_metadata(DrawCommandParams::Character(CharacterDrawParams {
                character_id: "yuki".to_string(),
                character_name: "Yuki".to_string(),
                sprite_asset_name: "yuki/default.png".to_string(),
                expression: Some("smile".to_string()),
                anchor: CharacterAnchor::Center,
                scale: 1.0,
                rotation_degrees: 0.0,
            })),
            physical_bounds: physical_rect(400, 80, 480, 640),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert!(matches!(
        &primitive.kind,
        WgpuNativeRenderPrimitiveKind::Character {
            character_id,
            sprite_asset_name,
            rotation_degrees,
        } if character_id == "yuki"
            && sprite_asset_name == "yuki/default.png"
            && *rotation_degrees == 0.0
    ));
    assert_eq!(
        primitive.resource_ids,
        vec![ResourceId::from("characters:yuki/default.png")]
    );
}

#[test]
fn prefers_bound_resources_over_params_when_lowering_primitives() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::BindResources {
            command_id: "character:yuki".to_string(),
            pipeline: DrawBatchPipeline::Character,
            resources: vec![bound_texture("characters:yuki/default.png")],
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "character:yuki".to_string(),
            pipeline: DrawBatchPipeline::Character,
            kind: DrawCommandKind::Image,
            metadata: draw_metadata(DrawCommandParams::Character(CharacterDrawParams {
                character_id: "yuki".to_string(),
                character_name: "Yuki".to_string(),
                sprite_asset_name: "wrong/fallback.png".to_string(),
                expression: None,
                anchor: CharacterAnchor::Center,
                scale: 1.0,
                rotation_degrees: 0.0,
            })),
            physical_bounds: physical_rect(400, 80, 480, 640),
            clip_depth: 0,
            resource_count: 1,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert_eq!(
        primitive.resource_ids,
        vec![ResourceId::from("characters:yuki/default.png")]
    );
}
