pub(in super::super::super) fn json_frame_with_unsafe_ui_asset_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_remote_background_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_native_audio_payload_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_unsafe_audio_asset_type_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_empty_asset_input() -> &'static str {
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
