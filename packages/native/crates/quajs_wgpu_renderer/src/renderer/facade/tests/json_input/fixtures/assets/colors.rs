pub(in super::super::super) fn json_frame_with_unsafe_dialogue_color_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "speakerStyle": {
            "color": "file:///tmp/native.node"
          },
          "text": "Opening"
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_unsafe_ui_color_input() -> &'static str {
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
                  "style": {
                    "backgroundColor": "../native.dll"
                  }
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_invalid_ui_color_literal_input() -> &'static str {
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
                  "kind": "Text",
                  "visible": true,
                  "text": "Menu",
                  "style": {
                    "color": "rgb(1., 0, 0)"
                  }
                }
              }
            }
          ]
        }
      }
    }
    "#
}
