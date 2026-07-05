pub(in super::super::super) fn json_frame_with_negative_ui_bounds_input() -> &'static str {
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
                  "bounds": { "x": 0, "y": 0, "width": -1, "height": 120 }
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_oversized_ui_scroll_offset_input() -> &'static str {
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
                  "id": "scroll",
                  "kind": "Scroll",
                  "bounds": { "x": 40, "y": 40, "width": 280, "height": 120 },
                  "scrollOffsetY": 1000001
                }
              }
            }
          ]
        }
      }
    }
    "#
}
