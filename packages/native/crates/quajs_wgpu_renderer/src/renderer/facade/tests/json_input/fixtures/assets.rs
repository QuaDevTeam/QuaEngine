pub(in super::super) fn json_frame_with_unsafe_ui_asset_input() -> &'static str {
    r##"
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
                  "kind": "Box",
                  "style": {
                    "backgroundImage": { "assetType": "images", "assetName": "../native/helper.wasm?raw" }
                  }
                }
              }
            }
          ]
        }
      }
    }
    "##
}

pub(in super::super) fn json_frame_with_remote_background_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "https://example.invalid/bg.png"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_native_audio_payload_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bridge",
              "kind": "bgm",
              "assetName": "audio/bridge.node#runtime"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_audio_asset_type_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bridge",
              "kind": "bgm",
              "assetType": "bgm/native",
              "assetName": "audio/theme.ogg"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_empty_asset_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "speaker": "Narrator",
          "text": "Opening",
          "avatar": {
            "assetName": "   #avatar"
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_traversal_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "../native/menu.qui",
                "root": { "id": "root", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_remote_scene_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "scene-overlay",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "https://example.invalid/menu.qui",
                  "root": { "id": "root", "kind": "Box" }
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_remote_provenance_package_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "provenance": {
            "contentPackageId": "https://example.invalid/runtime.ui"
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_traversal_required_package_input() -> &'static str {
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
                  "kind": "Box",
                  "provenance": {
                    "contentPackageId": "runtime.ui",
                    "requiredRuntimePackages": ["runtime.fonts", "../base"]
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

pub(in super::super) fn json_frame_with_remote_dialogue_font_family_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_traversal_ui_font_family_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_unsafe_dialogue_color_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
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

pub(in super::super) fn json_frame_with_unsafe_ui_color_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_invalid_ui_color_literal_input() -> &'static str {
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
