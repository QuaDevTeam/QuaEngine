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
          "overlays": [
            {
              "elementId": "menu",
              "stackPriority": 1001,
              "surface": {
                "key": "ui/menu.qui",
                "root": { "id": "root", "kind": "Box" }
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
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Panel",
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
