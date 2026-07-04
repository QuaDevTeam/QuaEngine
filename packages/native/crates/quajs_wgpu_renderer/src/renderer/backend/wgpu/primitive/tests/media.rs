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
        } if asset_type == "images"
            && asset_name == "atlas/menu.png"
            && *fit == MediaFit::Contain
            && origin == &MediaOrigin::default()
            && primitive_source == &source
            && *rotation_degrees == 12.5
    ));
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
                poster_asset_name: Some("opening-poster.png".to_string()),
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
            fit,
            origin,
            source,
            fallback_reason,
        } if asset_type == "video"
            && asset_name == "opening.mp4"
            && poster_asset_name.as_deref() == Some("opening-poster.png")
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
