pub(in super::super) const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");
pub(in super::super) const COMPILED_CHOICE_LOOP_FRAME: &str =
    include_str!("../../../../../../../../test-fixtures/renderer/compiled-choice-loop-frame.json");

pub(in super::super) fn json_frame_input() -> &'static str {
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
          "layers": [],
          "assetName": "bg/menu.png",
          "provenance": {
            "contentPackageId": "base",
            "requiredRuntimePackages": ["runtime.bg"]
          }
        },
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Box",
                  "visible": true,
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
                      "visible": true,
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
                      "visible": true,
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

pub(in super::super) fn json_frame_with_audio_input() -> &'static str {
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
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "looped": true,
              "volume": 0.8,
              "durationMs": 2400,
              "fadeInMs": 150,
              "fadeOutMs": 300,
              "crossfadeMs": 450,
              "playAt": 1700000000750,
              "delayMs": 750,
              "seekMs": 1200,
              "offsetMs": 50
            }
          ]
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_video_background_input() -> &'static str {
    r#"
    {
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "video",
          "layers": [],
          "video": {
            "assetName": "video/opening.webm",
            "poster": "poster/opening.png",
            "loop": true,
            "muted": false,
            "volume": 0.65,
            "playbackRate": 1.25,
            "fit": "contain",
            "origin": "right 75%",
            "opacity": 0.85,
            "provenance": {
              "contentPackageId": "runtime.video",
              "requiredRuntimePackages": ["base", "runtime.media"]
            }
          }
        }
      }
    }
    "#
}

pub(in super::super) fn json_frame_with_scroll_offset_input() -> &'static str {
    r##"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "scroll",
                  "kind": "Scroll",
                  "visible": true,
                  "bounds": { "x": 40, "y": 40, "width": 280, "height": 120 },
                  "scrollOffsetY": 72,
                  "children": [
                    {
                      "id": "inside",
                      "kind": "Button",
                      "visible": true,
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

pub(in super::super) fn json_frame_with_compiled_choice_loop_input() -> &'static str {
    COMPILED_CHOICE_LOOP_FRAME
}
