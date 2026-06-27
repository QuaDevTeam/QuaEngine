use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

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
