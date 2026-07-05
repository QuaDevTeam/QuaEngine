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
            "sprite": "characters/yuki.png"
          }
        ]
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
              "playbackState": "playing",
              "assetName": "music/opening.ogg"
            },
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetType": "bgm",
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
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Column",
                  "children": [
                    {
                      "id": "missing-kind",
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
