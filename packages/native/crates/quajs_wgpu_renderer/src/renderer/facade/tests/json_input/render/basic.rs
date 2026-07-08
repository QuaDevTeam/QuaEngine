use super::*;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, DrawCommandParams, MediaFit};
use crate::renderer::NullNativeRenderBackend;
use crate::resources::{NativeResourceKind, ResourceId};

#[test]
fn prepares_and_submits_frame_from_projection_json() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(json_frame_input())
        .expect("json frame input should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.update.resource_sync.upsert.len(), 4);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.pass_count, 2);
    assert_eq!(result.submission.resource_count, 4);
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
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Image));
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Text));
    assert!(safe_pipelines.contains(&DrawBatchPipeline::Ui));
    assert!(result.submission.passes[1].batches.iter().any(|batch| batch
        .resolved_resource_ids
        .contains(&ResourceId::from("images:ui/panel.png"))));
    assert!(result.submission.passes[1]
        .batches
        .iter()
        .any(|batch| batch.command_ids.contains(&"ui:menu:close".to_string())));
    assert_eq!(renderer.backend().diagnostics().submitted_frames, 1);
    assert_eq!(renderer.resources().len(), 4);

    let frame = renderer.state().frame().expect("frame prepared");
    let background_image = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:root:background-image")
        .expect("ui background image command exists");
    match &background_image.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.fit, MediaFit::Contain);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.0);
        }
        _ => panic!("expected image params"),
    }

    let root = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:root")
        .expect("ui root command exists");
    match &root.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.padding.top, 18.0);
            assert_eq!(params.padding.right, 22.0);
            assert_eq!(params.padding.bottom, 18.0);
            assert_eq!(params.padding.left, 22.0);
        }
        _ => panic!("expected root panel params"),
    }

    let title = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:title")
        .expect("ui title command exists");
    match &title.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.padding.top, 2.0);
            assert_eq!(params.padding.right, 4.0);
            assert_eq!(params.padding.bottom, 6.0);
            assert_eq!(params.padding.left, 4.0);
        }
        _ => panic!("expected title text params"),
    }

    let close_command = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:close")
        .expect("ui close command exists");
    match &close_command.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.padding.top, 8.0);
            assert_eq!(params.padding.right, 14.0);
            assert_eq!(params.padding.bottom, 10.0);
            assert_eq!(params.padding.left, 16.0);
        }
        _ => panic!("expected close button params"),
    }

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
    assert_eq!(renderer.resources().len(), 4);
}

#[test]
fn prepares_font_plugin_projection_resources_from_json() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let update = renderer
        .prepare_frame_json_str(
            r#"
            {
              "container": { "width": 1600, "height": 1000 },
              "view": {
                "plugins": {
                  "fonts": {
                    "revision": 1,
                    "requiredRuntimePackages": ["runtime.shared-fonts"],
                    "faces": [
                      {
                        "id": "noto-serif-jp",
                        "family": "Noto Serif JP",
                        "assetType": "fonts",
                        "assetName": "fonts/noto-serif-jp.woff2",
                        "weight": 500,
                        "style": "normal",
                        "provenance": {
                          "contentPackageId": "runtime.fonts",
                          "requiredRuntimePackages": ["base"]
                        }
                      }
                    ]
                  }
                }
              }
            }
            "#,
        )
        .expect("font projection JSON should prepare");

    assert_eq!(update.font_resource_sync.upsert.len(), 1);
    assert_eq!(update.font_assets.requests.len(), 1);
    assert_eq!(update.font_backend_commands.commands.len(), 2);
    assert_eq!(
        update.font_backend_commands.next_faces["noto-serif-jp"].package_candidates,
        ["base", "runtime.fonts", "runtime.shared-fonts"]
            .into_iter()
            .map(ToString::to_string)
            .collect()
    );
    let font_resource = renderer
        .resources()
        .get("font:face:fonts:fonts/noto-serif-jp.woff2")
        .expect("font face resource recorded");
    assert_eq!(font_resource.kind, NativeResourceKind::FontFace);
    assert_eq!(
        font_resource.owner_package_id.as_deref(),
        Some("runtime.fonts")
    );
    assert!(font_resource.required_package_ids.contains("base"));
    assert!(font_resource
        .required_package_ids
        .contains("runtime.shared-fonts"));
}

#[test]
fn renders_video_background_json_as_poster_fallback_projection() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(json_frame_with_video_background_input())
        .expect("video fallback JSON frame input should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.update.resource_sync.upsert.len(), 1);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.fallback_summary.fallback_count, 1);
    assert_eq!(result.submission.fallback_summary.video_fallback_count, 1);
    assert_eq!(
        result.submission.fallback_summary.by_pipeline[&DrawBatchPipeline::Video],
        1
    );
    assert_eq!(
        result.submission.fallback_summary.by_reason["native video decode backend is not active"],
        1
    );
    assert_eq!(
        result.submission.fallback_summary.by_owner_package["runtime.video"],
        1
    );
    assert_eq!(
        result.submission.fallback_summary.by_required_package["base"],
        1
    );
    assert_eq!(
        result.submission.fallback_summary.by_required_package["runtime.media"],
        1
    );

    let frame = renderer.state().frame().expect("frame prepared");
    let video = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "background:video")
        .expect("video background command exists");
    assert_eq!(video.kind, DrawCommandKind::VideoFrame);
    assert_eq!(video.opacity, 0.85);
    assert_eq!(video.owner_package_id.as_deref(), Some("runtime.video"));
    assert!(video.required_package_ids.contains("base"));
    assert!(video.required_package_ids.contains("runtime.media"));
    assert_eq!(
        video.resource_ids,
        vec![ResourceId::from("images:poster/opening.png")]
    );
    match &video.params {
        DrawCommandParams::Video(params) => {
            assert_eq!(params.asset_type, "video");
            assert_eq!(params.asset_name, "video/opening.webm");
            assert_eq!(
                params.poster_asset_name.as_deref(),
                Some("poster/opening.png")
            );
            assert_eq!(params.looped, Some(true));
            assert_eq!(params.muted, Some(false));
            assert_eq!(params.volume, Some(0.65));
            assert_eq!(params.playback_rate, Some(1.25));
            assert_eq!(params.fit, MediaFit::Contain);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.75);
            assert_eq!(
                params.fallback_reason.as_deref(),
                Some("native video decode backend is not active")
            );
        }
        _ => panic!("expected video draw params"),
    }

    let poster_resource = renderer
        .resources()
        .get("images:poster/opening.png")
        .expect("poster texture resource recorded");
    assert_eq!(poster_resource.kind, NativeResourceKind::Texture);
    assert_eq!(
        poster_resource.owner_package_id.as_deref(),
        Some("runtime.video")
    );
    assert!(poster_resource.required_package_ids.contains("base"));
    assert!(poster_resource
        .required_package_ids
        .contains("runtime.media"));

    let metrics = renderer.metrics();
    assert_eq!(metrics.frame.fallback_count, 1);
    assert_eq!(metrics.frame.video_fallback_count, 1);
    assert_eq!(metrics.frame.fallbacks_by_owner_package["runtime.video"], 1);
    assert_eq!(metrics.frame.fallbacks_by_required_package["base"], 1);
    assert_eq!(
        metrics.frame.fallbacks_by_required_package["runtime.media"],
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["runtime.video"].request_count,
        1
    );
}
