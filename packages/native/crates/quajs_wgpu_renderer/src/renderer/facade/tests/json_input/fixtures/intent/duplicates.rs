pub(in super::super::super) fn json_frame_with_duplicate_overlay_element_id_input() -> &'static str
{
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
                "root": { "id": "root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
              }
            },
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/secondary.qui",
                "root": { "id": "secondary-root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_duplicate_surface_node_id_input() -> &'static str {
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
                  "kind": "Box",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "children": [
                    {
                      "id": "root",
                      "kind": "Button",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "width": 120, "height": 48 },
                      "intent": { "event": "ui/intent", "action": "open" }
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

pub(in super::super::super) fn json_frame_with_duplicate_scene_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "settings-primary",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "ui/settings.qui",
                  "root": { "id": "settings-root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
                }
              }
            },
            {
              "elementId": "settings-secondary",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "ui/settings-secondary.qui",
                  "root": { "id": "secondary-root", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
                }
              }
            }
          ]
        }
      }
    }
    "#
}
