pub(in super::super) fn json_frame_with_negative_layout_width_input() -> &'static str {
    r#"
    {
      "layout": { "width": -1, "height": 1080 },
      "container": { "width": 1600, "height": 1000 },
      "view": {}
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_view_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_view_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": "scene"
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_dialogue_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": "Opening"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_background_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": "bg/main.png"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_background_mode_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "assetName": "bg/main.png"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_background_layers_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": "bg/fg.png"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_background_layer_item_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            "bg/fg.png"
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_background_layer_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            {
              "assetName": "bg/fg.png"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_background_layer_asset_name_input() -> &'static str
{
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "layered",
          "layers": [
            {
              "id": "foreground"
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_background_video_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "video": "video/opening.webm"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_background_video_asset_name_input() -> &'static str
{
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "video": {
            "poster": "video/poster.png"
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_choice_set_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": "start"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_ui_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": "menu"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_characters_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": "hero"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_character_item_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "characters": [
          "hero"
        ]
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_audio_projection_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": "bgm"
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_audio_tracks_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": "bgm"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_malformed_audio_track_item_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            "bgm"
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_inverted_layout_aspect_interval_input() -> &'static str {
    r#"
    {
      "layout": { "minAspectRatio": 2, "maxAspectRatio": 1 },
      "container": { "width": 1600, "height": 1000 },
      "view": {}
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_container_dpr_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000, "devicePixelRatio": 128 },
      "view": {}
    }
    "#
}

pub(in super::super) fn json_frame_with_negative_safe_area_inset_input() -> &'static str {
    r#"
    {
      "container": {
        "width": 1600,
        "height": 1000,
        "safeAreaInsets": { "top": 0, "right": 0, "bottom": -1, "left": 0 }
      },
      "view": {}
    }
    "#
}
