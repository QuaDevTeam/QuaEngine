pub(in super::super) fn json_frame_with_control_character_ui_text_input() -> &'static str {
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
                  "id": "title",
                  "kind": "Text",
                  "text": "Open\u001bMenu"
                }
              }
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_ui_text_input() -> String {
    format!(
        r#"
    {{
      "container": {{ "width": 1600, "height": 1000 }},
      "view": {{
        "ui": {{
          "overlays": [
            {{
              "elementId": "menu",
              "surface": {{
                "key": "ui/menu.qui",
                "root": {{
                  "id": "title",
                  "kind": "Text",
                  "text": "{}"
                }}
              }}
            }}
          ]
        }}
      }}
    }}
    "#,
        "a".repeat(64 * 1024 + 1)
    )
}

pub(in super::super) fn json_frame_with_control_character_choice_text_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "visible": true,
          "choices": [
            { "id": "start", "text": "Start\u001bGame", "enabled": true }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_choice_text_input() -> String {
    format!(
        r#"
    {{
      "container": {{ "width": 1600, "height": 1000 }},
      "view": {{
        "choices": {{
          "visible": true,
          "choices": [
            {{ "id": "start", "text": "{}", "enabled": true }}
          ]
        }}
      }}
    }}
    "#,
        "a".repeat(64 * 1024 + 1)
    )
}

pub(in super::super) fn json_frame_with_missing_choice_set_visible_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "choices": [
            { "id": "start", "text": "Start", "enabled": true }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_choice_set_items_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "visible": true
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_choice_enabled_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "choices": {
          "visible": true,
          "choices": [
            { "id": "start", "text": "Start" }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_dialogue_mode_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "speaker": "Narrator",
          "text": "Opening"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_missing_dialogue_visible_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "mode": "say",
          "speaker": "Narrator",
          "text": "Opening"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_control_character_dialogue_plain_text_input() -> &'static str
{
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "text": "Opening\u001bLine"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_control_character_dialogue_span_text_input() -> &'static str
{
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "text": {
            "blocks": [
              {
                "spans": [
                  { "text": "Bad\u001bSpan" }
                ]
              }
            ]
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_dialogue_rich_text_input() -> String {
    let first = "a".repeat(32 * 1024);
    let second = "b".repeat(32 * 1024 + 1);
    let mut input = String::from(
        r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "text": {
            "blocks": [
              {
                "spans": [
                  { "text": ""#,
    );
    input.push_str(&first);
    input.push_str(
        r#"" },
                  { "text": ""#,
    );
    input.push_str(&second);
    input.push_str(
        r#"" }
                ]
              }
            ]
          }
        }
      }
    }
    "#,
    );
    input
}

pub(in super::super) fn json_frame_with_zero_dialogue_speaker_font_size_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "speakerStyle": {
            "fontSize": 0
          },
          "text": "Opening"
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_oversized_dialogue_line_height_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "text": {
            "style": {
              "lineHeight": 1000001
            },
            "blocks": [
              {
                "spans": [
                  { "text": "Opening" }
                ]
              }
            ]
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_zero_dialogue_span_font_size_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "visible": true,
          "mode": "say",
          "speaker": "Narrator",
          "text": {
            "blocks": [
              {
                "spans": [
                  {
                    "text": "Opening",
                    "style": {
                      "fontSize": 0
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    }
    "#
}
