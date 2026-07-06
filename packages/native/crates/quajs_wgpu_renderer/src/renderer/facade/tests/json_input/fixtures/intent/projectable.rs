pub(in super::super::super) fn json_frame_with_projectable_surface_intent_targets_input(
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
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Stack",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 360, "height": 120 },
                  "children": [
                    {
                      "id": "box-hotspot",
                      "kind": "Box",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                      "intent": {
                        "event": "ui/intent",
                        "action": "open",
                        "metadata": { "arg0": "box" }
                      }
                    },
                    {
                      "id": "backdrop-hotspot",
                      "kind": "Backdrop",
                      "visible": true,
                      "bounds": { "x": 120, "y": 0, "width": 100, "height": 100 },
                      "intent": {
                        "event": "ui/intent",
                        "action": "close"
                      }
                    },
                    {
                      "id": "panel-hotspot",
                      "kind": "Panel",
                      "visible": true,
                      "bounds": { "x": 240, "y": 0, "width": 100, "height": 100 },
                      "intent": {
                        "event": "ui/intent",
                        "action": "open",
                        "metadata": { "arg0": "panel" }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    }
    "#
}
