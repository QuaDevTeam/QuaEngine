use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

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

#[test]
fn json_frame_identity_validation_requires_explicit_character_visibility() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_character_visible_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].visible");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing character visible validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_requires_explicit_ui_visibility() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_ui_visible_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.visible");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing UI visible validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_requires_explicit_surface_node_kind() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_surface_node_kind_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.children[0].kind"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing surface node kind validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_requires_explicit_surface_node_visibility() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_surface_node_visible_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.children[0].visible"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing surface node visible validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_requires_explicit_surface_node_bounds() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_surface_node_bounds_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.bounds");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing surface node bounds validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_requires_explicit_surface_node_bounds_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_surface_node_bounds_width_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.children[0].bounds.width"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing surface node bounds validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_rejects_surface_leaf_children() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_surface_leaf_children_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.children");
            assert_eq!(validation.asset_name, "Text");
            assert!(validation.reason.contains("leaf content model"));
            assert!(validation.reason.contains("cannot contain child nodes"));
        }
        other => panic!("expected surface leaf children validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_identity_validation_rejects_unsupported_surface_node_kind() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_unsupported_surface_node_kind_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.kind");
            assert_eq!(validation.asset_name, "Dialog");
            assert!(validation.reason.contains("not a supported"));
            assert!(validation
                .reason
                .contains("foundational native-wgpu node kind"));
        }
        other => panic!("expected unsupported surface node kind validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
