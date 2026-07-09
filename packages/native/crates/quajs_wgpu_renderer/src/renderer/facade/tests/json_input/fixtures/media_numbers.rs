pub(in super::super) fn json_frame_with_negative_background_width_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "layers": [],
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
          "layers": [],
          "video": {
            "assetName": "video/opening.webm",
            "opacity": 1.5
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_video_volume_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "layers": [],
          "video": {
            "assetName": "video/opening.webm",
            "volume": 1.5
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_zero_video_playback_rate_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "layers": [],
          "video": {
            "assetName": "video/opening.webm",
            "playbackRate": 0
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsafe_video_position_input(
    field: &str,
    value_json: &str,
) -> String {
    format!(
        r#"
        {{
          "container": {{ "width": 1600, "height": 1000 }},
          "view": {{
            "background": {{
              "mode": "video",
              "layers": [],
              "video": {{
                "assetName": "video/opening.webm",
                "{field}": {value_json}
              }}
            }}
          }}
        }}
        "#
    )
}

pub(in super::super) fn json_frame_with_oversized_background_origin_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "layers": [],
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
          "layers": [],
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
            "visible": true,
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
            "visible": true,
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
            "visible": true,
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
            "visible": true,
            "sprite": "characters/yuki.png",
            "position": { "rotation": 360001 }
          }
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_unsupported_background_video_field_input(
    field: &str,
    value_json: &str,
) -> String {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "layers": [],
          "video": {
            "assetName": "movies/opening.webm",
            "__VIDEO_FIELD__": __VIDEO_FIELD_VALUE__
          }
        }
      }
    }
    "#
    .replace("__VIDEO_FIELD__", field)
    .replace("__VIDEO_FIELD_VALUE__", value_json)
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
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
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
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
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

pub(in super::super) fn json_frame_with_unsafe_audio_timing_input(
    field: &str,
    value_json: &str,
) -> String {
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
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "__AUDIO_TIMING_FIELD__": __AUDIO_TIMING_VALUE__,
              "volume": 0.8
            }
          ]
        }
      }
    }
    "#
    .replace("__AUDIO_TIMING_FIELD__", field)
    .replace("__AUDIO_TIMING_VALUE__", value_json)
}

pub(in super::super) fn json_frame_with_web_audio_alias_field_input(
    field: &str,
    value_json: &str,
) -> String {
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
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "__WEB_AUDIO_ALIAS_FIELD__": __WEB_AUDIO_ALIAS_VALUE__,
              "volume": 0.8
            }
          ]
        }
      }
    }
    "#
    .replace("__WEB_AUDIO_ALIAS_FIELD__", field)
    .replace("__WEB_AUDIO_ALIAS_VALUE__", value_json)
}

pub(in super::super) fn json_frame_with_missing_audio_asset_type_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "voice-main",
              "kind": "voice",
              "assetName": "voice/opening.ogg",
              "loadMode": "buffered",
              "playbackState": "playing"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_audio_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "kind": "bgm",
              "assetName": "music/opening.ogg",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_audio_kind_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "assetName": "music/opening.ogg",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_audio_asset_name_input() -> &'static str {
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
              "playbackState": "playing"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_audio_load_mode_input() -> &'static str {
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
              "assetType": "bgm",
              "playbackState": "playing"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_audio_playback_state_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "sfx-confirm",
              "kind": "sfx",
              "assetName": "sfx/confirm.ogg",
              "assetType": "sfx",
              "loadMode": "buffered"
            }
          ]
        }
      }
    }
    "#
}
