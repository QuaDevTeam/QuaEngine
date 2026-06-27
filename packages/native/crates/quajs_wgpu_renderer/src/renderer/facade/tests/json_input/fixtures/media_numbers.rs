pub(in super::super) fn json_frame_with_negative_background_width_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "bg/main.png",
          "width": -1
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_zero_background_layer_scale_input() -> &'static str {
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
              "scale": 0
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_background_layer_rotation_input() -> &'static str
{
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
              "rotation": 360001
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_video_opacity_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "video": {
            "assetName": "video/opening.webm",
            "opacity": 1.5
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_background_origin_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "bg/main.png",
          "origin": "120% 50%"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_background_layer_origin_input() -> &'static str {
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
              "origin": "left ../native.dll"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_remote_background_video_origin_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "video": {
            "assetName": "video/opening.webm",
            "origin": "native:load"
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_negative_character_width_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png",
            "position": { "width": -1 }
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_zero_character_scale_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png",
            "position": { "scale": 0 }
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_character_opacity_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png",
            "opacity": 1.5
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_character_rotation_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          {
            "id": "yuki",
            "name": "Yuki",
            "sprite": "characters/yuki.png",
            "position": { "rotation": 360001 }
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_audio_volume_input() -> &'static str {
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

pub(in super::super) fn json_frame_with_oversized_audio_memory_input() -> &'static str {
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
