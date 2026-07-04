pub(in super::super::super) fn json_frame_with_remote_dialogue_font_family_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "speaker": "Narrator",
          "speakerStyle": {
            "fontFamily": ["https://example.invalid/font.ttf"]
          },
          "text": "Opening"
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_traversal_ui_font_family_input() -> &'static str {
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
                  "kind": "Text",
                  "text": "Menu",
                  "style": {
                    "fontFamily": ["../fonts/Bad"]
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
