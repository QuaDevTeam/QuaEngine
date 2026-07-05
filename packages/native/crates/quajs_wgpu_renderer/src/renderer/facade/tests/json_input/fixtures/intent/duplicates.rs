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
                "root": { "id": "root", "kind": "Box", "visible": true }
              }
            },
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/secondary.qui",
                "root": { "id": "secondary-root", "kind": "Box", "visible": true }
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
                  "root": { "id": "settings-root", "kind": "Box", "visible": true }
                }
              }
            },
            {
              "elementId": "settings-secondary",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "ui/settings-secondary.qui",
                  "root": { "id": "secondary-root", "kind": "Box", "visible": true }
                }
              }
            }
          ]
        }
      }
    }
    "#
}
