use super::super::super::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

#[test]
fn sprite_layer_fields_are_validated_before_preparing_resources() {
    for (field, value) in [
        ("asset", serde_json::json!("../escape.png")),
        ("offsetX", serde_json::json!(1e20)),
        ("offsetY", serde_json::json!(-1e20)),
        ("scale", serde_json::json!(-1)),
        ("scale", serde_json::json!(0)),
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
