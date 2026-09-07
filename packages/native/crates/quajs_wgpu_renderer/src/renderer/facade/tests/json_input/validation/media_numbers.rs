use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

#[test]
fn json_frame_audio_number_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let volume = renderer
        .prepare_frame_json_str(json_frame_with_oversized_audio_volume_input())
        .unwrap_err();
    match volume {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.audio.tracks[0].volume");
            assert_eq!(validation.asset_name, "16.5");
            assert!(validation.reason.contains("between 0 and 16"));
        }
        other => panic!("expected unsafe audio volume validation error, got {other:?}"),
    }

    let memory = renderer
        .prepare_frame_json_str(json_frame_with_oversized_audio_memory_input())
        .unwrap_err();
    match memory {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.audio.tracks[0].memory.bufferCpuBytes"
            );
            assert_eq!(validation.asset_name, "2147483649");
            assert!(validation.reason.contains("memory estimates"));
        }
        other => panic!("expected unsafe audio memory validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_audio_timing_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json, reason) in [
        ("seekMs", "-1", "non-negative"),
        ("playAt", "8640000000001", "timestamp"),
    ] {
        let input = json_frame_with_unsafe_audio_timing_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, format!("view.audio.tracks[0].{field}"));
                assert!(validation.reason.contains(reason));
            }
            other => panic!("expected unsafe audio timing validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_audio_projection_validation_rejects_web_audio_alias_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, replacement, value_json) in [
        ("assetKey", "assetName", r#""music/opening.ogg""#),
        ("state", "playbackState", r#""stopped""#),
        ("loop", "looped", "true"),
        ("playing", "playbackState", "true"),
    ] {
        let input = json_frame_with_web_audio_alias_field_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, format!("view.audio.tracks[0].{field}"));
                assert_eq!(validation.asset_name, field);
                assert!(validation.reason.contains(replacement));
            }
            other => panic!("expected unsupported audio field validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_background_video_validation_rejects_unsupported_playback_state_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (field, value_json) in [
        ("playbackState", r#""paused""#),
        ("state", r#""stopped""#),
        ("playing", "false"),
    ] {
        let input = json_frame_with_unsupported_background_video_field_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, format!("view.background.video.{field}"));
                assert_eq!(validation.asset_name, field);
                assert!(validation
                    .reason
                    .contains("native background video projection"));
                assert!(validation.reason.contains("playbackRate/seekMs/offsetMs"));
            }
            other => panic!(
                "expected unsupported background video field validation error, got {other:?}"
            ),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_audio_projection_validation_requires_explicit_bridge_fields() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    for (input, path) in [
        (
            json_frame_with_missing_audio_id_input(),
            "view.audio.tracks[0].id",
        ),
        (
            json_frame_with_missing_audio_kind_input(),
            "view.audio.tracks[0].kind",
        ),
        (
            json_frame_with_missing_audio_asset_name_input(),
            "view.audio.tracks[0].assetName",
        ),
        (
            json_frame_with_missing_audio_asset_type_input(),
            "view.audio.tracks[0].assetType",
        ),
        (
            json_frame_with_missing_audio_load_mode_input(),
            "view.audio.tracks[0].loadMode",
        ),
        (
            json_frame_with_missing_audio_playback_state_input(),
            "view.audio.tracks[0].playbackState",
        ),
    ] {
        let error = renderer.prepare_frame_json_str(input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, path);
                assert!(validation.reason.contains("explicitly provided"));
            }
            other => panic!("expected missing audio bridge field validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_background_number_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let width = renderer
        .prepare_frame_json_str(json_frame_with_negative_background_width_input())
        .unwrap_err();
    match width {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.width");
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("must not be negative"));
        }
        other => panic!("expected unsafe background width validation error, got {other:?}"),
    }

    let scale = renderer
        .prepare_frame_json_str(json_frame_with_zero_background_layer_scale_input())
        .unwrap_err();
    match scale {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[0].scale");
            assert_eq!(validation.asset_name, "0");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe background layer scale validation error, got {other:?}"),
    }

    let rotation = renderer
        .prepare_frame_json_str(json_frame_with_oversized_background_layer_rotation_input())
        .unwrap_err();
    match rotation {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[0].rotation");
            assert_eq!(validation.asset_name, "360001");
            assert!(validation.reason.contains("exceeds"));
        }
        other => {
            panic!("expected unsafe background layer rotation validation error, got {other:?}")
        }
    }

    let opacity = renderer
        .prepare_frame_json_str(json_frame_with_oversized_video_opacity_input())
        .unwrap_err();
    match opacity {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.video.opacity");
            assert_eq!(validation.asset_name, "1.5");
            assert!(validation.reason.contains("between 0 and 1"));
        }
        other => panic!("expected unsafe video opacity validation error, got {other:?}"),
    }

    let volume = renderer
        .prepare_frame_json_str(json_frame_with_oversized_video_volume_input())
        .unwrap_err();
    match volume {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.video.volume");
            assert_eq!(validation.asset_name, "1.5");
            assert!(validation.reason.contains("between 0 and 1"));
        }
        other => panic!("expected unsafe video volume validation error, got {other:?}"),
    }

    let playback_rate = renderer
        .prepare_frame_json_str(json_frame_with_zero_video_playback_rate_input())
        .unwrap_err();
    match playback_rate {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.video.playbackRate");
            assert_eq!(validation.asset_name, "0");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe video playbackRate validation error, got {other:?}"),
    }

    for (field, value_json, reason) in [
        ("seekMs", "-1", "must not be negative"),
        ("offsetMs", "86400001", "exceeds"),
    ] {
        let input = json_frame_with_unsafe_video_position_input(field, value_json);
        let error = renderer.prepare_frame_json_str(&input).unwrap_err();
        match error {
            NativeRendererJsonFrameError::Validation(validation) => {
                assert_eq!(validation.path, format!("view.background.video.{field}"));
                assert!(validation.reason.contains(reason));
            }
            other => panic!("expected unsafe video position validation error, got {other:?}"),
        }
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_background_origin_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background = renderer
        .prepare_frame_json_str(json_frame_with_oversized_background_origin_input())
        .unwrap_err();
    match background {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.origin");
            assert_eq!(validation.asset_name, "120% 50%");
            assert!(validation.reason.contains("0%..100%"));
        }
        other => panic!("expected unsafe background origin validation error, got {other:?}"),
    }

    let layer = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_background_layer_origin_input())
        .unwrap_err();
    match layer {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.layers[0].origin");
            assert_eq!(validation.asset_name, "left ../native.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected unsafe background layer origin validation error, got {other:?}"),
    }

    let video = renderer
        .prepare_frame_json_str(json_frame_with_remote_background_video_origin_input())
        .unwrap_err();
    match video {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.background.video.origin");
            assert_eq!(validation.asset_name, "native:load");
            assert!(validation.reason.contains("URI"));
        }
        other => panic!("expected unsafe background video origin validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_character_number_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let width = renderer
        .prepare_frame_json_str(json_frame_with_negative_character_width_input())
        .unwrap_err();
    match width {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].position.width");
            assert_eq!(validation.asset_name, "-1");
            assert!(validation.reason.contains("must not be negative"));
        }
        other => panic!("expected unsafe character width validation error, got {other:?}"),
    }

    let scale = renderer
        .prepare_frame_json_str(json_frame_with_zero_character_scale_input())
        .unwrap_err();
    match scale {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].position.scale");
            assert_eq!(validation.asset_name, "0");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe character scale validation error, got {other:?}"),
    }

    let opacity = renderer
        .prepare_frame_json_str(json_frame_with_oversized_character_opacity_input())
        .unwrap_err();
    match opacity {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].opacity");
            assert_eq!(validation.asset_name, "1.5");
            assert!(validation.reason.contains("between 0 and 1"));
        }
        other => panic!("expected unsafe character opacity validation error, got {other:?}"),
    }

    let rotation = renderer
        .prepare_frame_json_str(json_frame_with_oversized_character_rotation_input())
        .unwrap_err();
    match rotation {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.characters[0].position.rotation");
            assert_eq!(validation.asset_name, "360001");
            assert!(validation.reason.contains("exceeds"));
        }
        other => panic!("expected unsafe character rotation validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn mask_layout_validation_reports_unsupported_fields_before_frame_preparation() {
    for (field, value) in [
        ("size", "calc(50% - 1px)"),
        ("position", "1e99px top"),
        ("repeat", "bad"),
        ("mode", "bad"),
    ] {
        let mut input: serde_json::Value = serde_json::from_str(json_frame_input()).unwrap();
        input["view"]["background"]["composition"] =
            serde_json::json!({"mask": {"assetName": "mask.png", field: value}});
        let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
        let error = renderer
            .prepare_frame_json_str(&input.to_string())
            .unwrap_err();
        let NativeRendererJsonFrameError::Validation(error) = error else {
            panic!("expected mask validation error")
        };
        assert_eq!(
            error.path,
            format!("view.background.composition.mask.{field}")
        );
        assert_eq!(renderer.state().revision(), 0);
    }
}

#[test]
fn drop_shadow_rejects_invalid_web_filter_inner_values_before_frame_preparation() {
    for value in [
        "drop-shadow(2px 3px black)",
        "2px 3px -5px black",
        "2px 3px 4px 5px red",
        "0 0 url(bad)",
    ] {
        let mut input: serde_json::Value = serde_json::from_str(json_frame_input()).unwrap();
        input["view"]["background"]["composition"] =
            serde_json::json!({"filter": {"dropShadow": value}});
        let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
        let error = renderer
            .prepare_frame_json_str(&input.to_string())
            .unwrap_err();
        let NativeRendererJsonFrameError::Validation(error) = error else {
            panic!("expected drop shadow validation")
        };
        assert_eq!(error.path, "view.background.composition.filter.dropShadow");
        assert_eq!(renderer.state().revision(), 0);
    }
}
