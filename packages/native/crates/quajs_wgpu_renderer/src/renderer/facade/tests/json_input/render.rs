use super::super::*;
use super::fixtures::*;
use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::render_graph::{DrawBatchPipeline, DrawCommandParams, LogicalRect, MediaFit};
use crate::renderer::{NativeRendererJsonFrameInput, NullNativeRenderBackend};
use crate::resources::{PackageUnloadBlockerReason, ResourceId};

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
fn prepares_shared_compiled_qui_qss_surface_fixture() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);
    assert_eq!(renderer.resources().len(), 5);
    let panel_resource = renderer
        .resources()
        .get("images:ui/panel.png")
        .expect("panel image resource recorded");
    assert_eq!(
        panel_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(panel_resource.required_package_ids.contains("base"));
    let poster_resource = renderer
        .resources()
        .get("images:ui/poster.png")
        .expect("poster image resource recorded");
    assert_eq!(
        poster_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(poster_resource
        .required_package_ids
        .contains("runtime.fonts"));
    let surface_resource = renderer
        .resources()
        .get("surface:ui/compiled-menu.qui")
        .expect("surface resource recorded");
    assert_eq!(
        surface_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(surface_resource.required_package_ids.contains("base"));
    assert!(renderer.resources().get("fonts:Qua Sans").is_some());
    assert!(renderer.resources().get("fonts:Fallback Serif").is_some());

    let frame = renderer.state().frame().expect("frame prepared");
    let command_ids = frame
        .graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();
    assert!(command_ids.contains(&"ui:compiled-menu:menu:background-image"));
    assert!(command_ids.contains(&"ui:compiled-menu:title"));
    assert!(command_ids.contains(&"ui:compiled-menu:poster"));
    assert!(command_ids.contains(&"ui:compiled-menu:open-settings"));

    let panel_background = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:menu:background-image")
        .expect("panel background image command exists");
    match &panel_background.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/panel.png");
            assert_eq!(params.fit, MediaFit::Contain);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.0);
        }
        _ => panic!("expected panel background image params"),
    }
    assert_eq!(
        panel_background.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(panel_background.required_package_ids.contains("base"));
    assert!(panel_background
        .required_package_ids
        .contains("runtime.fonts"));

    let panel = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:menu")
        .expect("compiled panel command exists");
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.padding.top, 18.0);
            assert_eq!(params.padding.right, 22.0);
            assert_eq!(params.padding.bottom, 18.0);
            assert_eq!(params.padding.left, 22.0);
        }
        _ => panic!("expected compiled panel params"),
    }

    let title = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:title")
        .expect("compiled title command exists");
    match &title.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.padding.top, 2.0);
            assert_eq!(params.padding.right, 4.0);
            assert_eq!(params.padding.bottom, 6.0);
            assert_eq!(params.padding.left, 4.0);
        }
        _ => panic!("expected compiled title params"),
    }

    let poster = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:poster")
        .expect("poster command exists");
    match &poster.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/poster.png");
            assert_eq!(params.fit, MediaFit::Cover);
        }
        _ => panic!("expected poster image params"),
    }
    assert_eq!(poster.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(poster.required_package_ids.contains("base"));
    assert!(poster.required_package_ids.contains("runtime.fonts"));

    let settings = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:open-settings")
        .expect("settings button command exists");
    match &settings.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.padding.top, 8.0);
            assert_eq!(params.padding.right, 14.0);
            assert_eq!(params.padding.bottom, 10.0);
            assert_eq!(params.padding.left, 16.0);
        }
        _ => panic!("expected settings button params"),
    }

    let hit = renderer
        .hit_intent(408.0, 354.0)
        .expect("settings button hit");
    assert_eq!(hit.command_id, "ui:compiled-menu:open-settings");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.action.as_deref(), Some("open"));
    assert_eq!(
        hit.intent.metadata.get("arg0"),
        Some(&serde_json::json!("settings"))
    );

    let plan = renderer.plan_package_unload("base");
    assert!(!plan.can_unload());
    assert!(plan.blocked.iter().any(|blocker| {
        blocker.reason == PackageUnloadBlockerReason::PackageRequiredByForeignResource
            && blocker.required_package_ids.contains("base")
            && blocker.owner_package_id.as_deref() == Some("runtime.ui")
    }));
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
fn projection_json_applies_resolved_scroll_offsets() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    renderer
        .prepare_frame_json_str(json_frame_with_scroll_offset_input())
        .expect("json frame input should prepare");

    let frame = renderer.state().frame().expect("frame prepared");
    let inside = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:inside")
        .expect("scroll child command exists");

    assert_eq!(
        inside.bounds,
        LogicalRect {
            x: 64.0,
            y: 84.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(
        inside.clip_bounds,
        vec![LogicalRect {
            x: 40.0,
            y: 40.0,
            width: 280.0,
            height: 120.0,
        }]
    );

    let hit = renderer.hit_intent(80.0, 96.0).expect("offset button hit");
    assert_eq!(hit.command_id, "ui:menu:inside");
    assert_eq!(hit.intent.action.as_deref(), Some("inside"));
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
