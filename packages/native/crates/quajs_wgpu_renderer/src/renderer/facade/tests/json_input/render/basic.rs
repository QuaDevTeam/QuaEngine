use super::*;
use crate::render_graph::{DrawBatchPipeline, DrawCommandParams, MediaFit};
use crate::renderer::NullNativeRenderBackend;
use crate::resources::ResourceId;

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
