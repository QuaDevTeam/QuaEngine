use crate::renderer::NativeRendererJsonFrameInput;

#[test]
fn json_frame_input_resolves_layout_defaults() {
    let input: NativeRendererJsonFrameInput = serde_json::from_str(
        r#"
        {
          "container": { "width": 1280, "height": 720 },
          "view": {}
        }
        "#,
    )
    .expect("json frame input should parse");

    let layout = input.resolved_layout();

    assert_eq!(layout.container_width, 1280.0);
    assert_eq!(layout.container_height, 720.0);
    assert_eq!(layout.logical_height, 1080.0);
}
