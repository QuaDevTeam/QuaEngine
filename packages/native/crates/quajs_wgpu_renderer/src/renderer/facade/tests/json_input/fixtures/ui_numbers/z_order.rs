pub(in super::super::super) fn json_frame_with_oversized_background_layer_z_index_input(
) -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            {
              "id": "foreground",
              "assetName": "bg/fg.png",
              "zIndex": 1000001
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_oversized_character_layer_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "visible": true,
            "sprite": "characters/yuki.png",
            "layer": -1000001
          }
        ]
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_oversized_overlay_stack_priority_input(
) -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "stackPriority": 1001,
              "surface": {
                "key": "ui/menu.qui",
                "root": { "id": "root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_oversized_ui_node_z_index_input() -> &'static str {
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
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Panel",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "zIndex": 1000001
                }
              }
            }
          ]
        }
      }
    }
    "#
}
