use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

#[test]
fn json_frame_z_order_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background_layer = renderer
        .prepare_frame_json_str(json_frame_with_oversized_background_layer_z_index_input())
        .unwrap_err();
    match background_layer {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[0].zIndex");
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("z-order limits"));
        }
        other => panic!("expected background layer zIndex validation error, got {other:?}"),
    }

    let character_layer = renderer
        .prepare_frame_json_str(json_frame_with_oversized_character_layer_input())
        .unwrap_err();
    match character_layer {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].layer");
            assert_eq!(validation.asset_name, "-1000001");
            assert!(validation.reason.contains("z-order limits"));
        }
        other => panic!("expected character layer validation error, got {other:?}"),
    }

    let stack_priority = renderer
        .prepare_frame_json_str(json_frame_with_oversized_overlay_stack_priority_input())
        .unwrap_err();
    match stack_priority {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].stackPriority");
            assert_eq!(validation.asset_name, "1001");
            assert!(validation.reason.contains("stack priority limits"));
        }
        other => panic!("expected overlay stack priority validation error, got {other:?}"),
    }

    let node_z_index = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_node_z_index_input())
        .unwrap_err();
    match node_z_index {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.zIndex");
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("z-order limits"));
        }
        other => panic!("expected UI node zIndex validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_ui_geometry_validation_rejects_unsafe_resolved_bounds() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let bounds = renderer
        .prepare_frame_json_str(json_frame_with_negative_ui_bounds_input())
        .unwrap_err();
    match bounds {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.bounds.width"
            );
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("must not be negative"));
        }
        other => panic!("expected negative UI bounds validation error, got {other:?}"),
    }

    let scroll_offset = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_scroll_offset_input())
        .unwrap_err();
    match scroll_offset {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.scrollOffsetY"
            );
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("logical limits"));
        }
        other => panic!("expected oversized UI scroll validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_ui_style_number_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let node_opacity = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_node_opacity_input())
        .unwrap_err();
    match node_opacity {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.opacity");
            assert_eq!(validation.asset_name, "1.1");
            assert!(validation.reason.contains("between 0 and 1"));
        }
        other => panic!("expected unsafe UI node opacity validation error, got {other:?}"),
    }

    let style_opacity = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_style_opacity_input())
        .unwrap_err();
    match style_opacity {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.opacity"
            );
            assert_eq!(validation.asset_name, "1.1");
            assert!(validation.reason.contains("between 0 and 1"));
        }
        other => panic!("expected unsafe UI style opacity validation error, got {other:?}"),
    }

    let background_position = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_background_position_input())
        .unwrap_err();
    match background_position {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.backgroundPosition.x"
            );
            assert_eq!(validation.asset_name, "1.5");
            assert!(validation.reason.contains("normalized values"));
        }
        other => panic!("expected unsafe UI background position validation error, got {other:?}"),
    }

    let object_position = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_object_position_input())
        .unwrap_err();
    match object_position {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.objectPosition.y"
            );
            assert_eq!(validation.asset_name, "-0.01");
            assert!(validation.reason.contains("normalized values"));
        }
        other => panic!("expected unsafe UI object position validation error, got {other:?}"),
    }

    let style_number = renderer
        .prepare_frame_json_str(json_frame_with_negative_ui_style_number_input())
        .unwrap_err();
    match style_number {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.borderWidth"
            );
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("must not be negative"));
        }
        other => panic!("expected unsafe UI style number validation error, got {other:?}"),
    }

    let padding = renderer
        .prepare_frame_json_str(json_frame_with_oversized_ui_padding_input())
        .unwrap_err();
    match padding {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.style.padding.left"
            );
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("logical limits"));
        }
        other => panic!("expected unsafe UI padding validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_ui_style_validation_rejects_malformed_style_object_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json) in [
        ("backgroundPosition", r#""center""#),
        ("objectPosition", "[0.5, 0.5]"),
        ("padding", "8"),
    ] {
        let input = json_frame_with_malformed_ui_style_object_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();

        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(
                    validation.path,
                    format!("view.ui.overlays[0].surface.root.style.{field}")
                );
                assert_eq!(validation.asset_name, "");
                assert!(validation.reason.contains("must be an object"));
                assert!(validation.reason.contains(field));
            }
            other => panic!("expected malformed UI style object validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
