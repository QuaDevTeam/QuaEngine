pub(in super::super::super) fn json_frame_with_forged_choice_metadata_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_unsafe_choice_id_input() -> &'static str {
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

pub(in super::super::super) fn json_frame_with_native_payload_choice_id_input() -> &'static str {
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
