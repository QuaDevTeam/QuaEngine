use super::*;
use crate::audio::{AudioBackendCommandKind, NullNativeAudioBackend};
use crate::render_graph::{DrawBatchPipeline, DrawCommandParams, LogicalRect, MediaFit};
use crate::renderer::{
    NativeRendererJsonFrameError, NativeRendererJsonFrameInput, NullNativeRenderBackend,
};
use crate::resources::{PackageUnloadBlockerReason, ResourceId};

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

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
fn unsafe_json_frame_asset_reference_returns_validation_error_without_advancing_renderer() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_asset_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.backgroundImage.assetName"
            );
            assert_eq!(validation.asset_name, "../native/helper.wasm?raw");
            assert!(validation.reason.contains("traverse"));
        }
        other => panic!("expected validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_asset_validation_rejects_url_and_native_audio_payloads() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background = renderer
        .prepare_frame_json_str(json_frame_with_remote_background_input())
        .unwrap_err();
    match background {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.assetName");
            assert_eq!(validation.asset_name, "https://example.invalid/bg.png");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected background validation error, got {other:?}"),
    }

    let audio = renderer
        .prepare_frame_json_str(json_frame_with_native_audio_payload_input())
        .unwrap_err();
    match audio {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.audio.tracks[0].assetName");
            assert_eq!(validation.asset_name, "audio/bridge.node#runtime");
            assert!(validation.reason.contains("native payloads"));
        }
        other => panic!("expected audio validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_asset_validation_rejects_unsafe_asset_types() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_audio_asset_type_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.audio.tracks[0].assetType");
            assert_eq!(validation.asset_name, "bgm/native");
            assert!(validation.reason.contains("asset types"));
        }
        other => panic!("expected validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_asset_validation_rejects_empty_asset_names() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_empty_asset_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.avatar.assetName");
            assert_eq!(validation.asset_name, "   #avatar");
            assert!(validation.reason.contains("empty"));
        }
        other => panic!("expected validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_asset_validation_rejects_unsafe_surface_keys() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay_surface = renderer
        .prepare_frame_json_str(json_frame_with_traversal_surface_key_input())
        .unwrap_err();
    match overlay_surface {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.key");
            assert_eq!(validation.asset_name, "../native/menu.qui");
            assert!(validation.reason.contains("traverse"));
        }
        other => panic!("expected surface key validation error, got {other:?}"),
    }

    let scene_surface = renderer
        .prepare_frame_json_str(json_frame_with_remote_scene_surface_key_input())
        .unwrap_err();
    match scene_surface {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].scene.surface.key");
            assert_eq!(validation.asset_name, "https://example.invalid/menu.qui");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected scene surface key validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_provenance_validation_rejects_unsafe_package_ids() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background = renderer
        .prepare_frame_json_str(json_frame_with_remote_provenance_package_input())
        .unwrap_err();
    match background {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.background.provenance.contentPackageId"
            );
            assert_eq!(validation.asset_name, "https://example.invalid/runtime.ui");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected background provenance validation error, got {other:?}"),
    }

    let ui = renderer
        .prepare_frame_json_str(json_frame_with_traversal_required_package_input())
        .unwrap_err();
    match ui {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.provenance.requiredRuntimePackages[0]"
            );
            assert_eq!(validation.asset_name, "../base");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected UI provenance validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_font_family_validation_rejects_unsafe_resource_names() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let dialogue = renderer
        .prepare_frame_json_str(json_frame_with_remote_dialogue_font_family_input())
        .unwrap_err();
    match dialogue {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.speakerStyle.fontFamily[0]");
            assert_eq!(validation.asset_name, "https://example.invalid/font.ttf");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected dialogue font validation error, got {other:?}"),
    }

    let ui = renderer
        .prepare_frame_json_str(json_frame_with_traversal_ui_font_family_input())
        .unwrap_err();
    match ui {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.fontFamily[0]"
            );
            assert_eq!(validation.asset_name, "../fonts/Bad");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected UI font validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_intent_validation_rejects_choice_select_without_canonical_choice_id() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_forged_choice_metadata_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("canonical choiceId"));
        }
        other => panic!("expected validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_intent_validation_rejects_unsafe_dispatch_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_overlay_element_id_input())
        .unwrap_err();
    match overlay {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].elementId");
            assert_eq!(validation.asset_name, "../menu");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected overlay element id validation error, got {other:?}"),
    }

    let node = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_surface_node_id_input())
        .unwrap_err();
    match node {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.id");
            assert_eq!(validation.asset_name, "file:///tmp/native.node");
            assert!(validation.reason.contains("URLs") || validation.reason.contains("URI"));
        }
        other => panic!("expected surface node id validation error, got {other:?}"),
    }

    let action = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_intent_action_input())
        .unwrap_err();
    match action {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.action"
            );
            assert_eq!(validation.asset_name, "native:load-plugin");
            assert!(validation.reason.contains("URI"));
        }
        other => panic!("expected UI intent action validation error, got {other:?}"),
    }

    let choice = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_choice_id_input())
        .unwrap_err();
    match choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "choices/native.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected choice id validation error, got {other:?}"),
    }

    let native_payload_choice = renderer
        .prepare_frame_json_str(json_frame_with_native_payload_choice_id_input())
        .unwrap_err();
    match native_payload_choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "native.dll");
            assert!(validation.reason.contains("native payloads"));
        }
        other => panic!("expected native payload choice id validation error, got {other:?}"),
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

fn json_frame_with_unsafe_ui_asset_input() -> &'static str {
    r##"
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
                  "kind": "Box",
                  "style": {
                    "backgroundImage": { "assetType": "images", "assetName": "../native/helper.wasm?raw" }
                  }
                }
              }
            }
          ]
        }
      }
    }
    "##
}

fn json_frame_with_remote_background_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "https://example.invalid/bg.png"
        }
      }
    }
    "#
}

fn json_frame_with_native_audio_payload_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bridge",
              "kind": "bgm",
              "assetName": "audio/bridge.node#runtime"
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_unsafe_audio_asset_type_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bridge",
              "kind": "bgm",
              "assetType": "bgm/native",
              "assetName": "audio/theme.ogg"
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_empty_asset_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "speaker": "Narrator",
          "text": "Opening",
          "avatar": {
            "assetName": "   #avatar"
          }
        }
      }
    }
    "#
}

fn json_frame_with_traversal_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "../native/menu.qui",
                "root": { "id": "root", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_remote_scene_surface_key_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "scene-overlay",
              "scene": {
                "id": "settings",
                "surface": {
                  "key": "https://example.invalid/menu.qui",
                  "root": { "id": "root", "kind": "Box" }
                }
              }
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_remote_provenance_package_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "provenance": {
            "contentPackageId": "https://example.invalid/runtime.ui"
          }
        }
      }
    }
    "#
}

fn json_frame_with_traversal_required_package_input() -> &'static str {
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
                  "kind": "Box",
                  "provenance": {
                    "contentPackageId": "runtime.ui",
                    "requiredRuntimePackages": ["runtime.fonts", "../base"]
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

fn json_frame_with_remote_dialogue_font_family_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "dialogue": {
          "speaker": "Narrator",
          "speakerStyle": {
            "fontFamily": ["https://example.invalid/font.ttf"]
          },
          "text": "Opening"
        }
      }
    }
    "#
}

fn json_frame_with_traversal_ui_font_family_input() -> &'static str {
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
                  "kind": "Text",
                  "text": "Menu",
                  "style": {
                    "fontFamily": ["../fonts/Bad"]
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

fn json_frame_with_forged_choice_metadata_input() -> &'static str {
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

fn json_frame_with_unsafe_overlay_element_id_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "overlays": [
            {
              "elementId": "../menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": { "id": "root", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_unsafe_surface_node_id_input() -> &'static str {
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
                "root": { "id": "file:///tmp/native.node", "kind": "Box" }
              }
            }
          ]
        }
      }
    }
    "#
}

fn json_frame_with_unsafe_ui_intent_action_input() -> &'static str {
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
                    "event": "ui/intent",
                    "action": "native:load-plugin"
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

fn json_frame_with_unsafe_choice_id_input() -> &'static str {
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

fn json_frame_with_native_payload_choice_id_input() -> &'static str {
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

fn json_frame_with_scroll_offset_input() -> &'static str {
    r##"
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
                  "id": "scroll",
                  "kind": "Scroll",
                  "bounds": { "x": 40, "y": 40, "width": 280, "height": 120 },
                  "scrollOffsetY": 72,
                  "children": [
                    {
                      "id": "inside",
                      "kind": "Button",
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
