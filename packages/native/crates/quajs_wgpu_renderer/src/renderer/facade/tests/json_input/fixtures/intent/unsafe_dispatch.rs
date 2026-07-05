pub(in super::super::super) fn json_frame_with_unsafe_overlay_element_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "../menu",
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

pub(in super::super::super) fn json_frame_with_unsafe_surface_node_id_input() -> &'static str {
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
                "root": { "id": "file:///tmp/native.node", "kind": "Box", "visible": true, "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 } }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_unsafe_scene_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "scene": {
                "id": "native/load.dll",
                "surface": {
                  "key": "ui/menu.qui",
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

pub(in super::super::super) fn json_frame_with_unsafe_overlay_stack_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "overlayStack": "native/load.dll",
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

pub(in super::super::super) fn json_frame_with_unsafe_scene_overlay_stack_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "scene": {
                "id": "settings",
                "overlay": {
                  "overlayStack": "https://example.invalid/stack"
                },
                "surface": {
                  "key": "ui/menu.qui",
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

pub(in super::super::super) fn json_frame_with_unsafe_ui_intent_action_input() -> &'static str {
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
                  "kind": "Button",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "intent": {
                    "event": "ui/intent",
                    "action": "native:load-plugin"
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

pub(in super::super::super) fn json_frame_with_missing_overlay_intent_event_input() -> &'static str
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
              "intent": {
                "action": "close"
              },
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

pub(in super::super::super) fn json_frame_with_missing_surface_intent_event_input() -> &'static str
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
                "root": {
                  "id": "root",
                  "kind": "Button",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "intent": {
                    "action": "open"
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

pub(in super::super::super) fn json_frame_with_unsafe_ui_intent_metadata_key_input() -> &'static str
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
                "root": {
                  "id": "root",
                  "kind": "Button",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "intent": {
                    "event": "ui/intent",
                    "action": "open",
                    "metadata": {
                      "native/load.dll": true
                    }
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

pub(in super::super::super) fn json_frame_with_oversized_ui_intent_metadata_input() -> &'static str
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
                "root": {
                  "id": "root",
                  "kind": "Button",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 },
                  "intent": {
                    "event": "ui/intent",
                    "action": "open",
                    "metadata": {
                      "arg00": true,
                      "arg01": true,
                      "arg02": true,
                      "arg03": true,
                      "arg04": true,
                      "arg05": true,
                      "arg06": true,
                      "arg07": true,
                      "arg08": true,
                      "arg09": true,
                      "arg10": true,
                      "arg11": true,
                      "arg12": true,
                      "arg13": true,
                      "arg14": true,
                      "arg15": true,
                      "arg16": true,
                      "arg17": true,
                      "arg18": true,
                      "arg19": true,
                      "arg20": true,
                      "arg21": true,
                      "arg22": true,
                      "arg23": true,
                      "arg24": true,
                      "arg25": true,
                      "arg26": true,
                      "arg27": true,
                      "arg28": true,
                      "arg29": true,
                      "arg30": true,
                      "arg31": true,
                      "arg32": true
                    }
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
