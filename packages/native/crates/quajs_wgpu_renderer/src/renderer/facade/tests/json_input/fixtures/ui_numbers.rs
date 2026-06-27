pub(in super::super) fn json_frame_with_oversized_background_layer_z_index_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_oversized_character_layer_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png",
            "layer": -1000001
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_overlay_stack_priority_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_oversized_ui_node_z_index_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_negative_ui_bounds_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_oversized_ui_scroll_offset_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_oversized_ui_node_opacity_input() -> &'static str {
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
                  "opacity": 1.1
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_ui_style_opacity_input() -> &'static str {
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
                  "style": {
                    "opacity": 1.1
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

pub(in super::super) fn json_frame_with_unsafe_ui_background_position_input() -> &'static str {
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
                  "style": {
                    "backgroundPosition": { "x": 1.5, "y": 0.5 }
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

pub(in super::super) fn json_frame_with_oversized_ui_padding_input() -> &'static str {
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
                  "style": {
                    "padding": { "top": 0, "right": 0, "bottom": 0, "left": 1000001 }
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

pub(in super::super) fn json_frame_with_negative_ui_style_number_input() -> &'static str {
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
                  "kind": "Button",
                  "style": {
                    "borderWidth": -1
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
