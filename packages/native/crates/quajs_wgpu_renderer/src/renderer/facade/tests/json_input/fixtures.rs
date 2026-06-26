pub(super) const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

pub(super) fn json_frame_with_unsafe_ui_asset_input() -> &'static str {
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

pub(super) fn json_frame_with_remote_background_input() -> &'static str {
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

pub(super) fn json_frame_with_native_audio_payload_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_audio_asset_type_input() -> &'static str {
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

pub(super) fn json_frame_with_empty_asset_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_background_layer_id_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_character_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "file:///tmp/native.node",
            "name": "Yuki",
            "sprite": "characters/yuki.png"
          }
        ]
      }
    }
    "#
}

pub(super) fn json_frame_with_unsafe_choice_projection_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "choices": [
            {
              "id": "choices/native.dll",
              "text": "Start"
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_unsafe_audio_track_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "native/load.dll",
              "kind": "bgm",
              "assetName": "music/opening.ogg"
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_traversal_surface_key_input() -> &'static str {
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

pub(super) fn json_frame_with_remote_scene_surface_key_input() -> &'static str {
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

pub(super) fn json_frame_with_remote_provenance_package_input() -> &'static str {
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

pub(super) fn json_frame_with_traversal_required_package_input() -> &'static str {
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

pub(super) fn json_frame_with_remote_dialogue_font_family_input() -> &'static str {
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

pub(super) fn json_frame_with_traversal_ui_font_family_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_dialogue_color_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_ui_color_input() -> &'static str {
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

pub(super) fn json_frame_with_invalid_ui_color_literal_input() -> &'static str {
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

pub(super) fn json_frame_with_forged_choice_metadata_input() -> &'static str {
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
                  "bounds": { "x": 0, "y": 0, "width": 200, "height": 80 },
                  "text": "Forged",
                  "intent": {
                    "event": "choice/select",
                    "action": "select",
                    "metadata": {
                      "choiceId": "forged-choice"
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

pub(super) fn json_frame_with_unsafe_overlay_element_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "../menu",
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

pub(super) fn json_frame_with_unsafe_surface_node_id_input() -> &'static str {
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
                "root": { "id": "file:///tmp/native.node", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_unsafe_scene_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "scene": {
                "id": "native/load.dll",
                "surface": {
                  "key": "ui/menu.qui",
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

pub(super) fn json_frame_with_unsafe_overlay_stack_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "overlayStack": "native/load.dll",
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

pub(super) fn json_frame_with_unsafe_scene_overlay_stack_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
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

pub(super) fn json_frame_with_unsafe_ui_intent_action_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_choice_id_input() -> &'static str {
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
                  "intent": {
                    "event": "choice/select",
                    "choiceId": "choices/native.dll",
                    "action": "select"
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

pub(super) fn json_frame_with_native_payload_choice_id_input() -> &'static str {
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
                  "intent": {
                    "event": "choice/select",
                    "choiceId": "native.dll",
                    "action": "select"
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

pub(super) fn json_frame_with_duplicate_overlay_element_id_input() -> &'static str {
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
                "root": { "id": "root", "kind": "Box" }
              }
            },
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/secondary.qui",
                "root": { "id": "secondary-root", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_duplicate_surface_node_id_input() -> &'static str {
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
                  "children": [
                    {
                      "id": "root",
                      "kind": "Button",
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

pub(super) fn json_frame_with_negative_ui_bounds_input() -> &'static str {
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

pub(super) fn json_frame_with_oversized_ui_scroll_offset_input() -> &'static str {
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

pub(super) fn json_frame_with_oversized_ui_node_opacity_input() -> &'static str {
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

pub(super) fn json_frame_with_oversized_ui_style_opacity_input() -> &'static str {
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

pub(super) fn json_frame_with_unsafe_ui_background_position_input() -> &'static str {
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

pub(super) fn json_frame_with_oversized_ui_padding_input() -> &'static str {
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

pub(super) fn json_frame_with_negative_ui_style_number_input() -> &'static str {
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

pub(super) fn json_frame_with_duplicate_scene_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "settings-primary",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "ui/settings.qui",
                  "root": { "id": "settings-root", "kind": "Box" }
                }
              }
            },
            {
              "elementId": "settings-secondary",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "ui/settings-secondary.qui",
                  "root": { "id": "secondary-root", "kind": "Box" }
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_duplicate_background_layer_id_input() -> &'static str {
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

pub(super) fn json_frame_with_duplicate_character_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki-a.png"
          },
          {
            "id": "yuki",
            "name": "Yuki Alt",
            "sprite": "characters/yuki-b.png"
          }
        ]
      }
    }
    "#
}

pub(super) fn json_frame_with_duplicate_choice_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "choices": [
            {
              "id": "start",
              "text": "Start"
            },
            {
              "id": "start",
              "text": "Start Again"
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_duplicate_audio_track_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "music/opening.ogg"
            },
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "music/loop.ogg"
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_oversized_audio_volume_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "music/opening.ogg",
              "volume": 1.5
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_oversized_audio_memory_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "music/opening.ogg",
              "memory": {
                "bufferCpuBytes": 2147483649,
                "streamCpuBytes": 0,
                "handleCpuBytes": 0
              }
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_input() -> &'static str {
    r##"
    {
      "layout": { "preset": "landscape" },
      "container": {
        "width": 1600,
        "height": 1000,
        "devicePixelRatio": 2,
        "safeAreaInsets": { "top": 10, "right": 20, "bottom": 30, "left": 40 }
      },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "bg/menu.png",
          "provenance": {
            "contentPackageId": "base",
            "requiredRuntimePackages": ["runtime.bg"]
          }
        },
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Box",
                  "bounds": { "x": 32, "y": 24, "width": 520, "height": 392 },
                  "style": {
                    "backgroundColor": "#101820",
                    "backgroundImage": { "assetType": "images", "assetName": "ui/panel.png" },
                    "backgroundPosition": { "x": 1, "y": 0 },
                    "backgroundSize": "contain",
                    "borderColor": "#5ac8fa",
                    "borderWidth": 2,
                    "borderRadius": 12,
                    "padding": { "top": 18, "right": 22, "bottom": 18, "left": 22 }
                  },
                  "children": [
                    {
                      "id": "title",
                      "kind": "Text",
                      "bounds": { "x": 64, "y": 58, "width": 360, "height": 56 },
                      "text": "Native Menu",
                      "style": {
                        "color": "#f7f3e8",
                        "fontFamily": ["Qua Sans"],
                        "fontSize": 34,
                        "fontWeight": "bold",
                        "lineHeight": 44,
                        "padding": { "top": 2, "right": 4, "bottom": 6, "left": 4 },
                        "textAlign": "center"
                      },
                      "provenance": {
                        "contentPackageId": "runtime.ui",
                        "requiredRuntimePackages": ["runtime.fonts"]
                      }
                    },
                    {
                      "id": "close",
                      "kind": "Button",
                      "bounds": { "x": 340, "y": 330, "width": 136, "height": 48 },
                      "text": "Close",
                      "intent": {
                        "event": "ui/intent",
                        "action": "close",
                        "metadata": { "source": "json-input-test" }
                      },
                      "style": {
                        "padding": { "top": 8, "right": 14, "bottom": 10, "left": 16 }
                      }
                    }
                  ]
                }
              },
              "provenance": { "contentPackageId": "runtime.ui" }
            }
          ]
        }
      }
    }
    "##
}

pub(super) fn json_frame_with_audio_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "audio/theme.ogg",
              "playing": true,
              "loop": true,
              "volume": 0.8
            }
          ]
        }
      }
    }
    "#
}

pub(super) fn json_frame_with_scroll_offset_input() -> &'static str {
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
                  "id": "scroll",
                  "kind": "Scroll",
                  "bounds": { "x": 40, "y": 40, "width": 280, "height": 120 },
                  "scrollOffsetY": 72,
                  "children": [
                    {
                      "id": "inside",
                      "kind": "Button",
                      "bounds": { "x": 64, "y": 156, "width": 220, "height": 56 },
                      "text": "Inside",
                      "intent": { "event": "ui/intent", "action": "inside" }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    }
    "##
}
