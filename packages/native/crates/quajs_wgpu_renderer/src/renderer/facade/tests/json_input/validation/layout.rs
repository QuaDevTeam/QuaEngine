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
