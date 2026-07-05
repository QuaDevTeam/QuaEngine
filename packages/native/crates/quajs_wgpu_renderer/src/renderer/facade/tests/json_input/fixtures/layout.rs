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
