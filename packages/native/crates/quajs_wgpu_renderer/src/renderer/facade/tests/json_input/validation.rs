use super::super::*;
use super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

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
fn json_frame_identity_validation_rejects_unsafe_projection_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let layer = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_background_layer_id_input())
        .unwrap_err();
    match layer {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[0].id");
            assert_eq!(validation.asset_name, "../foreground");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected background layer id validation error, got {other:?}"),
    }

    let character = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_character_id_input())
        .unwrap_err();
    match character {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].id");
            assert_eq!(validation.asset_name, "file:///tmp/native.node");
            assert!(validation.reason.contains("URLs") || validation.reason.contains("URI"));
        }
        other => panic!("expected character id validation error, got {other:?}"),
    }

    let choice = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_choice_projection_id_input())
        .unwrap_err();
    match choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.choices.choices[0].id");
            assert_eq!(validation.asset_name, "choices/native.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected choice id validation error, got {other:?}"),
    }

    let audio = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_audio_track_id_input())
        .unwrap_err();
    match audio {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.audio.tracks[0].id");
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected audio track id validation error, got {other:?}"),
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
fn json_frame_color_validation_rejects_unsafe_resolved_color_literals() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let dialogue = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_dialogue_color_input())
        .unwrap_err();
    match dialogue {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.speakerStyle.color");
            assert_eq!(validation.asset_name, "file:///tmp/native.node");
            assert!(validation.reason.contains("URLs") || validation.reason.contains("URI"));
        }
        other => panic!("expected dialogue color validation error, got {other:?}"),
    }

    let ui = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_color_input())
        .unwrap_err();
    match ui {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.backgroundColor"
            );
            assert_eq!(validation.asset_name, "../native.dll");
            assert!(validation.reason.contains("paths") || validation.reason.contains("traversal"));
        }
        other => panic!("expected UI color validation error, got {other:?}"),
    }

    let invalid_literal = renderer
        .prepare_frame_json_str(json_frame_with_invalid_ui_color_literal_input())
        .unwrap_err();
    match invalid_literal {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.color"
            );
            assert_eq!(validation.asset_name, "rgb(1., 0, 0)");
            assert!(validation.reason.contains("color literals must be hex"));
        }
        other => panic!("expected invalid UI color literal validation error, got {other:?}"),
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

#[test]
fn json_frame_identity_validation_rejects_duplicate_projection_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let layer = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_background_layer_id_input())
        .unwrap_err();
    match layer {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[1].id");
            assert_eq!(validation.asset_name, "foreground");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate background layer id validation error, got {other:?}"),
    }

    let character = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_character_id_input())
        .unwrap_err();
    match character {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[1].id");
            assert_eq!(validation.asset_name, "yuki");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate character id validation error, got {other:?}"),
    }

    let choice = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_choice_id_input())
        .unwrap_err();
    match choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.choices.choices[1].id");
            assert_eq!(validation.asset_name, "start");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate choice id validation error, got {other:?}"),
    }

    let audio = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_audio_track_id_input())
        .unwrap_err();
    match audio {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.audio.tracks[1].id");
            assert_eq!(validation.asset_name, "bgm-main");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate audio track id validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
