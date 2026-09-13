use super::*;

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
