pub(in super::super::super) fn json_frame_with_traversal_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "../native/menu.qui",
                "root": { "id": "root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_remote_scene_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "scene-overlay",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "https://example.invalid/menu.qui",
                  "root": { "id": "root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
                }
              }
            }
          ]
        }
      }
    }
    "#
}
