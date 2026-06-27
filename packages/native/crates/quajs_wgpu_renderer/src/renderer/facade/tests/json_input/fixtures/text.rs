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

pub(in super::super) fn json_frame_with_control_character_dialogue_plain_text_input() -> &'static str
{
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
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
