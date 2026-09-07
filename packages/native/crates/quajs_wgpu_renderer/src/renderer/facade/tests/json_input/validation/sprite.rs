use super::super::super::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

#[test]
fn sprite_layer_fields_are_validated_before_preparing_resources() {
    for (field, value) in [
        ("asset", serde_json::json!("../escape.png")),
        ("offsetX", serde_json::json!(1e20)),
        ("offsetY", serde_json::json!(-1e20)),
        ("scale", serde_json::json!(1e20)),
        ("rotation", serde_json::json!(1e20)),
        ("opacity", serde_json::json!(1.1)),
        ("zIndex", serde_json::json!(i32::MAX)),
    ] {
        let mut frame = serde_json::json!({"view":{"characters":[{
            "id":"yuki", "name":"Yuki", "visible":true, "sprite":"yuki/base.png",
            "spriteLayers":[{"asset":"yuki/face.png"}]
        }]}});
        frame["view"]["characters"][0]["spriteLayers"][0][field] = value;
        let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
        let error = renderer
            .prepare_frame_json_str(&frame.to_string())
            .unwrap_err();
        let NativeRendererJsonFrameError::Validation(error) = error else {
            panic!("expected sprite validation, got {error:?}");
        };
        assert_eq!(
            error.path,
            format!("view.characters[0].spriteLayers[0].{field}")
        );
        assert_eq!(renderer.state().revision(), 0);
    }
}

#[test]
fn zero_and_negative_sprite_layer_scales_survive_json_validation() {
    use crate::render_graph::DrawCommandParams;
    for scale in [0.0, -0.5] {
        let frame = serde_json::json!({"view":{"characters":[{
            "id":"mira", "name":"Mira", "visible":true, "sprite":"mira/base.png",
            "spriteBase":{"asset":"mira/base.png", "scale":scale}
        }]}});
        let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
        renderer.prepare_frame_json_str(&frame.to_string()).unwrap();
        let command = &renderer.state().frame().unwrap().graph.commands()[0];
        if scale == 0.0 {
            assert_eq!(command.opacity, 0.0);
        } else {
            let DrawCommandParams::Image(image) = &command.params else {
                panic!("image");
            };
            assert_eq!(image.rotation_degrees, 180.0);
        }
    }
}
