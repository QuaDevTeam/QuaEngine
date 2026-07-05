use super::super::super::*;
use super::super::fixtures::*;
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
fn json_frame_layout_validation_requires_explicit_view_projection() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_view_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing view validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_layout_validation_rejects_malformed_view_projection_shape() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_malformed_view_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("must be an object"));
        }
        other => panic!("expected malformed view validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_layout_validation_rejects_malformed_background_projection_shapes() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (input, path, reason) in [
        (
            json_frame_with_malformed_background_projection_input(),
            "view.background",
            "must be an object",
        ),
        (
            json_frame_with_malformed_background_layers_input(),
            "view.background.layers",
            "must be an array",
        ),
        (
            json_frame_with_malformed_background_layer_item_input(),
            "view.background.layers[0]",
            "must be an object",
        ),
        (
            json_frame_with_malformed_background_video_input(),
            "view.background.video",
            "must be an object",
        ),
    ] {
        let error = renderer.prepare_frame_json_str(input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, path);
                assert_eq!(validation.asset_name, "");
                assert!(validation.reason.contains(reason));
            }
            other => {
                panic!("expected malformed background projection validation error, got {other:?}")
            }
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_layout_validation_rejects_malformed_projection_section_shapes() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (input, path) in [
        (
            json_frame_with_malformed_dialogue_projection_input(),
            "view.dialogue",
        ),
        (
            json_frame_with_malformed_choice_set_projection_input(),
            "view.choices",
        ),
        (json_frame_with_malformed_ui_projection_input(), "view.ui"),
    ] {
        let error = renderer.prepare_frame_json_str(input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, path);
                assert_eq!(validation.asset_name, "");
                assert!(validation.reason.contains("must be an object"));
            }
            other => {
                panic!("expected malformed projection section validation error, got {other:?}")
            }
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_layout_validation_rejects_malformed_projection_collection_shapes() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (input, path, reason) in [
        (
            json_frame_with_malformed_characters_projection_input(),
            "view.characters",
            "must be an array",
        ),
        (
            json_frame_with_malformed_character_item_input(),
            "view.characters[0]",
            "must be an object",
        ),
        (
            json_frame_with_malformed_audio_projection_input(),
            "view.audio",
            "must be an object",
        ),
        (
            json_frame_with_malformed_audio_tracks_input(),
            "view.audio.tracks",
            "must be an array",
        ),
        (
            json_frame_with_malformed_audio_track_item_input(),
            "view.audio.tracks[0]",
            "must be an object",
        ),
    ] {
        let error = renderer.prepare_frame_json_str(input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, path);
                assert_eq!(validation.asset_name, "");
                assert!(validation.reason.contains(reason));
            }
            other => {
                panic!("expected malformed projection collection validation error, got {other:?}")
            }
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_layout_validation_rejects_unsafe_stage_inputs() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let layout_width = renderer
        .prepare_frame_json_str(json_frame_with_negative_layout_width_input())
        .unwrap_err();
    match layout_width {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "layout.width");
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe layout width validation error, got {other:?}"),
    }

    let aspect_interval = renderer
        .prepare_frame_json_str(json_frame_with_inverted_layout_aspect_interval_input())
        .unwrap_err();
    match aspect_interval {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "layout.minAspectRatio");
            assert_eq!(validation.asset_name, "2");
            assert!(validation.reason.contains("must not exceed maxAspectRatio"));
        }
        other => panic!("expected unsafe layout aspect interval validation error, got {other:?}"),
    }

    let dpr = renderer
        .prepare_frame_json_str(json_frame_with_oversized_container_dpr_input())
        .unwrap_err();
    match dpr {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "container.devicePixelRatio");
            assert_eq!(validation.asset_name, "128");
            assert!(validation.reason.contains("exceeds"));
        }
        other => panic!("expected unsafe container DPR validation error, got {other:?}"),
    }

    let safe_area = renderer
        .prepare_frame_json_str(json_frame_with_negative_safe_area_inset_input())
        .unwrap_err();
    match safe_area {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "container.safeAreaInsets.bottom");
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("must not be negative"));
        }
        other => panic!("expected unsafe safe-area validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
