pub(in super::super) fn json_frame_with_unsafe_background_layer_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            {
              "id": "../foreground",
              "assetName": "bg/fg.png"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_character_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "file:///tmp/native.node",
            "name": "Yuki",
            "visible": true,
            "sprite": "characters/yuki.png"
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_character_visible_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png"
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_ui_visible_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": []
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_choice_projection_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "visible": true,
          "choices": [
            {
              "id": "choices/native.dll",
              "text": "Start",
              "enabled": true
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_audio_track_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "native/load.dll",
              "kind": "bgm",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "assetName": "music/opening.ogg"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_duplicate_background_layer_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            {
              "id": "foreground",
              "assetName": "bg/fg-a.png"
            },
            {
              "id": "foreground",
              "assetName": "bg/fg-b.png"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_duplicate_character_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "visible": true,
            "sprite": "characters/yuki-a.png"
          },
          {
            "id": "yuki",
            "name": "Yuki Alt",
            "visible": true,
            "sprite": "characters/yuki-b.png"
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_duplicate_choice_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "visible": true,
          "choices": [
            {
              "id": "start",
              "text": "Start",
              "enabled": true
            },
            {
              "id": "start",
              "text": "Start Again",
              "enabled": true
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_duplicate_audio_track_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "assetName": "music/opening.ogg"
            },
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "assetName": "music/loop.ogg"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_surface_node_kind_input() -> &'static str {
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
                  "kind": "Column",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 240, "height": 120 },
                  "children": [
                    {
                      "id": "missing-kind",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "width": 160, "height": 48 },
                      "text": "Missing kind"
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

pub(in super::super) fn json_frame_with_missing_surface_node_visible_input() -> &'static str {
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
                  "kind": "Column",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 240, "height": 120 },
                  "children": [
                    {
                      "id": "missing-visible",
                      "kind": "Button",
                      "bounds": { "x": 0, "y": 0, "width": 160, "height": 48 },
                      "text": "Missing visible"
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

pub(in super::super) fn json_frame_with_missing_surface_node_bounds_input() -> &'static str {
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
                  "id": "missing-bounds",
                  "kind": "Column",
                  "visible": true
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_surface_node_bounds_width_input() -> &'static str {
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
                  "kind": "Column",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 240, "height": 120 },
                  "children": [
                    {
                      "id": "missing-bounds-width",
                      "kind": "Button",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "height": 48 },
                      "text": "Missing bounds width"
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

pub(in super::super) fn json_frame_with_surface_leaf_children_input() -> &'static str {
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
                  "id": "message",
                  "kind": "Text",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 240, "height": 48 },
                  "text": "Leaf text",
                  "children": [
                    {
                      "id": "nested-action",
                      "kind": "Button",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "width": 160, "height": 48 },
                      "text": "Nested"
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

pub(in super::super) fn json_frame_with_unsupported_surface_node_kind_input() -> &'static str {
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
                  "id": "dialog",
                  "kind": "Dialog",
                  "visible": true,
                  "bounds": { "x": 0, "y": 0, "width": 480, "height": 240 },
                  "children": [
                    {
                      "id": "dialog-body",
                      "kind": "Panel",
                      "visible": true,
                      "bounds": { "x": 0, "y": 0, "width": 480, "height": 240 }
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
