use super::*;

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
fn json_frame_asset_validation_rejects_empty_ui_image_asset_names() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_empty_ui_image_asset_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.image.assetName"
            );
            assert_eq!(validation.asset_name, "   #poster");
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
