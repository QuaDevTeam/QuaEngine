use super::*;
use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::{
    NativeRendererJsonFrameError, NativeRendererJsonFrameInput, NullNativeRenderBackend,
};
use crate::resources::ResourceId;

#[test]
fn prepares_and_submits_frame_from_projection_json() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(json_frame_input())
        .expect("json frame input should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.update.resource_sync.upsert.len(), 3);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.pass_count, 2);
    assert_eq!(result.submission.resource_count, 3);
    assert_eq!(result.submission.missing_resource_count, 0);
    assert_eq!(
        result.submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/menu.png")]
    );
    let safe_pipelines = result.submission.passes[1]
        .batches
        .iter()
        .map(|batch| batch.pipeline)
        .collect::<Vec<_>>();
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Shape));
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Text));
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Ui));
    assert!(result.submission.passes[1]
        .batches
        .iter()
        .any(|batch| batch.command_ids.contains(&"ui:menu:close".to_string())));
    assert_eq!(renderer.backend().diagnostics().submitted_frames, 1);
    assert_eq!(renderer.resources().len(), 3);

    let close = renderer.hit_intent(408.0, 354.0).expect("close button hit");
    assert_eq!(close.intent.event, "ui/intent");
    assert_eq!(close.intent.action.as_deref(), Some("close"));
    assert_eq!(close.intent.element_id.as_deref(), Some("menu:close"));
    assert_eq!(close.intent.metadata["source"], "json-input-test");
}

#[test]
fn can_prepare_json_frame_without_render_submission() {
    let mut renderer = NativeRenderer::new(RecordingBackend::default());

    let update = renderer
        .prepare_frame_json_str(json_frame_input())
        .expect("json frame input should prepare");

    assert_eq!(update.revision, 1);
    assert_eq!(renderer.backend().submissions.len(), 0);
    assert_eq!(renderer.resources().len(), 3);
}

#[test]
fn can_apply_audio_backend_from_projection_json() {
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );

    let result = renderer
        .prepare_render_json_and_apply_audio_str(json_frame_with_audio_input())
        .expect("json frame input should render and apply audio");

    assert_eq!(result.submission.revision, 1);
    assert_eq!(
        result
            .update
            .audio_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            AudioBackendCommandKind::LoadAsset,
            AudioBackendCommandKind::StartTrack,
        ]
    );
    assert_eq!(
        renderer
            .audio_backend()
            .unwrap()
            .diagnostics()
            .active_track_count,
        1
    );
}

#[test]
fn malformed_json_returns_parse_error_without_advancing_renderer() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer.prepare_frame_json_str("{ not json").unwrap_err();

    match error {
        NativeRendererJsonFrameError::Parse(parse) => {
            assert!(parse.message.contains("key"));
            assert_eq!(parse.line, 1);
            assert!(parse.column > 0);
        }
        other => panic!("expected parse error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_input_resolves_layout_defaults() {
    let input: NativeRendererJsonFrameInput = serde_json::from_str(
        r#"
        {
          "container": { "width": 1280, "height": 720 },
          "view": {}
        }
        "#,
    )
    .expect("json frame input should parse");

    let layout = input.resolved_layout();

    assert_eq!(layout.container_width, 1280.0);
    assert_eq!(layout.container_height, 720.0);
    assert_eq!(layout.logical_height, 1080.0);
}

fn json_frame_input() -> &'static str {
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
          "assetName": "bg/menu.png",
          "provenance": {
            "contentPackageId": "base",
            "requiredRuntimePackages": ["runtime.bg"]
          }
        },
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Box",
                  "bounds": { "x": 32, "y": 24, "width": 520, "height": 392 },
                  "style": {
                    "backgroundColor": "#101820",
                    "borderColor": "#5ac8fa",
                    "borderWidth": 2,
                    "borderRadius": 12
                  },
                  "children": [
                    {
                      "id": "title",
                      "kind": "Text",
                      "bounds": { "x": 64, "y": 58, "width": 360, "height": 56 },
                      "text": "Native Menu",
                      "style": {
                        "color": "#f7f3e8",
                        "fontFamily": ["Qua Sans"],
                        "fontSize": 34,
                        "fontWeight": "bold",
                        "lineHeight": 44,
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
                      "bounds": { "x": 340, "y": 330, "width": 136, "height": 48 },
                      "text": "Close",
                      "intent": {
                        "event": "ui/intent",
                        "action": "close",
                        "metadata": { "source": "json-input-test" }
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

fn json_frame_with_audio_input() -> &'static str {
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
              "playing": true,
              "loop": true,
              "volume": 0.8
            }
          ]
        }
      }
    }
    "#
}
