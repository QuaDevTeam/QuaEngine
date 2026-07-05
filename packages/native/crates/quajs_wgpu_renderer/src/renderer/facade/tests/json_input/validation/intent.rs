use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

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
fn json_frame_intent_validation_requires_explicit_intent_event() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay = renderer
        .prepare_frame_json_str(json_frame_with_missing_overlay_intent_event_input())
        .unwrap_err();
    match overlay {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].intent.event");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing overlay intent event validation error, got {other:?}"),
    }

    let surface = renderer
        .prepare_frame_json_str(json_frame_with_missing_surface_intent_event_input())
        .unwrap_err();
    match surface {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.event"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing surface intent event validation error, got {other:?}"),
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

    let scene = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_scene_id_input())
        .unwrap_err();
    match scene {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].scene.id");
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected scene id validation error, got {other:?}"),
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

    let metadata_key = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_intent_metadata_key_input())
        .unwrap_err();
    match metadata_key {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.metadata.native/load.dll"
            );
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected UI intent metadata key validation error, got {other:?}"),
    }

    let metadata_payload = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_intent_metadata_input())
        .unwrap_err();
    match metadata_payload {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.metadata"
            );
            assert_eq!(validation.asset_name, "33");
            assert!(validation.reason.contains("payload limits"));
        }
        other => panic!("expected UI intent metadata payload validation error, got {other:?}"),
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
fn json_frame_ui_validation_rejects_unsafe_overlay_stack_names() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay_stack = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_overlay_stack_input())
        .unwrap_err();
    match overlay_stack {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].overlayStack");
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected overlay stack validation error, got {other:?}"),
    }

    let scene_overlay_stack = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_scene_overlay_stack_input())
        .unwrap_err();
    match scene_overlay_stack {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].scene.overlay.overlayStack"
            );
            assert_eq!(validation.asset_name, "https://example.invalid/stack");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected scene overlay stack validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_intent_validation_rejects_duplicate_ui_dispatch_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_overlay_element_id_input())
        .unwrap_err();
    match overlay {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[1].elementId");
            assert_eq!(validation.asset_name, "menu");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate overlay id validation error, got {other:?}"),
    }

    let node = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_surface_node_id_input())
        .unwrap_err();
    match node {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.children[0].id"
            );
            assert_eq!(validation.asset_name, "root");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate surface node id validation error, got {other:?}"),
    }

    let scene = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_scene_id_input())
        .unwrap_err();
    match scene {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[1].scene.id");
            assert_eq!(validation.asset_name, "settings");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate scene id validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
