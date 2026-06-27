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
            assert_eq!(validation.asset_name, "1.5");
            assert!(validation.reason.contains("between 0 and 1"));
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
