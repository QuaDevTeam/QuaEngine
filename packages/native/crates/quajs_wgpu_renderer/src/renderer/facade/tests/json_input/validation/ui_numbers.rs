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

    let overlay_z_index = renderer
        .prepare_frame_json_str(json_frame_with_oversized_overlay_z_index_input())
        .unwrap_err();
    match overlay_z_index {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].zIndex");
            assert_eq!(validation.asset_name, "-1000001");
            assert!(validation.reason.contains("z-order limits"));
        }
        other => panic!("expected overlay zIndex validation error, got {other:?}"),
    }

    let scene_overlay_stack_priority = renderer
        .prepare_frame_json_str(json_frame_with_oversized_scene_overlay_stack_priority_input())
        .unwrap_err();
    match scene_overlay_stack_priority {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].scene.overlay.stackPriority"
            );
            assert_eq!(validation.asset_name, "-1001");
            assert!(validation.reason.contains("stack priority limits"));
        }
        other => panic!("expected scene overlay stack priority validation error, got {other:?}"),
    }

    let scene_overlay_z_index = renderer
        .prepare_frame_json_str(json_frame_with_oversized_scene_overlay_z_index_input())
        .unwrap_err();
    match scene_overlay_z_index {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].scene.overlay.zIndex");
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("z-order limits"));
        }
        other => panic!("expected scene overlay zIndex validation error, got {other:?}"),
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
fn json_frame_ui_gradient_validation_accepts_canonical_stops_and_rejects_legacy_or_unsafe_data() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
    let valid_radial = json_frame_with_malformed_ui_style_object_input(
        "backgroundGradient",
        r#"{
            "kind": "radial",
            "centerX": 0.5,
            "centerY": 0.5,
            "radius": 0.70710678118,
            "shape": "ellipse",
            "stops": [
                { "color": "transparent", "position": 0.46 },
                { "color": "rgba(0,0,0,0.34)", "position": 1.0 }
            ]
        }"#,
    );
    renderer
        .prepare_frame_json_str(&valid_radial)
        .unwrap_or_else(|error| {
            panic!("expected non-zero radial start stop to be valid: {error:?}")
        });

    for (value_json, expected_path_suffix, expected_reason) in [
        (
            r##"{
                "kind": "linear",
                "angleDegrees": 90,
                "startColor": "#000",
                "endColor": "#fff"
            }"##,
            "backgroundGradient.endColor",
            "not a supported",
        ),
        (
            r##"{
                "kind": "radial",
                "centerX": 0.5,
                "centerY": 0.5,
                "radius": 0.7,
                "stops": [
                    { "color": "#000", "position": 0.2 },
                    { "color": "#fff", "position": 1.0 }
                ]
            }"##,
            "backgroundGradient.shape",
            "explicitly provided",
        ),
        (
            r##"{
                "kind": "linear",
                "angleDegrees": 90,
                "stops": [{ "color": "#000", "position": 0.0 }]
            }"##,
            "backgroundGradient.stops",
            "between 2 and 8",
        ),
        (
            r##"{
                "kind": "linear",
                "angleDegrees": 90,
                "stops": [
                    { "color": "#000", "position": 0.7 },
                    { "color": "#fff", "position": 0.2 }
                ]
            }"##,
            "backgroundGradient.stops",
            "strictly increasing",
        ),
        (
            r##"{
                "kind": "linear",
                "angleDegrees": 90,
                "stops": [
                    { "color": "url(native.dll)", "position": 0.0 },
                    { "color": "#fff", "position": 1.0 }
                ]
            }"##,
            "backgroundGradient.stops[0].color",
            "color literals must",
        ),
    ] {
        let input =
            json_frame_with_malformed_ui_style_object_input("backgroundGradient", value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert!(
                    validation.path.ends_with(expected_path_suffix),
                    "unexpected validation path: {}",
                    validation.path
                );
                assert!(
                    validation.reason.contains(expected_reason),
                    "unexpected validation reason: {}",
                    validation.reason
                );
            }
            other => panic!("expected gradient validation error, got {other:?}"),
        }
    }
}

#[test]
fn json_frame_ui_style_validation_rejects_malformed_style_object_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json) in [
        ("backgroundPosition", r#""center""#),
        ("backgroundPosition", "null"),
        ("objectPosition", "[0.5, 0.5]"),
        ("objectPosition", "null"),
        ("boxShadow", "null"),
        ("textShadow", r#""0 2px 8px #000""#),
        ("padding", "8"),
        ("padding", "null"),
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

#[test]
fn json_frame_ui_style_validation_accepts_resolved_shadow_objects() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json) in [
        (
            "boxShadow",
            r#"{
                "offsetX": 0,
                "offsetY": 12,
                "blurRadius": 32,
                "spreadRadius": -2,
                "color": "rgba(0,0,0,0.42)",
                "inset": true
            }"#,
        ),
        (
            "textShadow",
            r#"{
                "offsetX": 0,
                "offsetY": 2,
                "blurRadius": 10,
                "spreadRadius": 0,
                "color": "rgba(0,0,0,0.72)",
                "inset": false
            }"#,
        ),
    ] {
        let input = json_frame_with_malformed_ui_style_object_input(field, value_json);
        renderer
            .prepare_frame_json_str(&input)
            .unwrap_or_else(|error| panic!("expected valid {field} projection, got {error:?}"));
    }
}

#[test]
fn json_frame_ui_style_validation_rejects_unsupported_resolved_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json, expected_path, expected_asset, expected_reason) in [
        (
            "boxSizing",
            r#""border-box""#,
            "view.ui.overlays[0].surface.root.style.boxSizing",
            "boxSizing",
            "supported native UI surface style field",
        ),
        (
            "backgroundPosition",
            r#"{ "x": 0.5, "y": 0.5, "left": 0.5 }"#,
            "view.ui.overlays[0].surface.root.style.backgroundPosition.left",
            "left",
            "supported native UI surface style backgroundPosition field",
        ),
        (
            "padding",
            r#"{ "top": 0, "right": 0, "bottom": 0, "left": 0, "inlineStart": 8 }"#,
            "view.ui.overlays[0].surface.root.style.padding.inlineStart",
            "inlineStart",
            "supported native UI surface style padding field",
        ),
        (
            "boxShadow",
            r##"{ "offsetX": 0, "offsetY": 4, "blurRadius": 8, "spreadRadius": 0, "color": "#000", "inset": false, "multiple": true }"##,
            "view.ui.overlays[0].surface.root.style.boxShadow.multiple",
            "multiple",
            "supported native UI surface style boxShadow field",
        ),
        (
            "textShadow",
            r##"{ "offsetX": 0, "color": "#000" }"##,
            "view.ui.overlays[0].surface.root.style.textShadow.offsetY",
            "",
            "explicitly provided",
        ),
        (
            "objectPosition",
            r#"{ "y": 0.5 }"#,
            "view.ui.overlays[0].surface.root.style.objectPosition.x",
            "",
            "explicitly provided",
        ),
    ] {
        let input = json_frame_with_malformed_ui_style_object_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();

        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, expected_path);
                assert_eq!(validation.asset_name, expected_asset);
                assert!(
                    validation.reason.contains(expected_reason),
                    "unexpected reason for {field}: {}",
                    validation.reason
                );
            }
            other => panic!("expected unsupported UI style field validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
