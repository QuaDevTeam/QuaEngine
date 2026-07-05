use super::super::super::*;
use super::super::fixtures::*;
use crate::renderer::{NativeRendererJsonFrameError, NullNativeRenderBackend};

#[test]
fn json_frame_ui_text_validation_rejects_unsafe_resolved_text_payloads() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let control = renderer
        .prepare_frame_json_str(json_frame_with_control_character_ui_text_input())
        .unwrap_err();
    match control {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.text");
            assert_eq!(validation.asset_name, "Open\u{1b}Menu");
            assert!(validation.reason.contains("control characters"));
        }
        other => panic!("expected unsafe UI text validation error, got {other:?}"),
    }

    let oversized_input = json_frame_with_oversized_ui_text_input();
    let oversized = renderer
        .prepare_frame_json_str(&oversized_input)
        .unwrap_err();
    match oversized {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.text");
            assert_eq!(validation.asset_name, (64 * 1024 + 1).to_string());
            assert!(validation.reason.contains("payload limits"));
        }
        other => panic!("expected oversized UI text validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_choice_text_validation_rejects_unsafe_resolved_text_payloads() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let control = renderer
        .prepare_frame_json_str(json_frame_with_control_character_choice_text_input())
        .unwrap_err();
    match control {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.choices.choices[0].text");
            assert_eq!(validation.asset_name, "Start\u{1b}Game");
            assert!(validation.reason.contains("control characters"));
        }
        other => panic!("expected unsafe choice text validation error, got {other:?}"),
    }

    let oversized_input = json_frame_with_oversized_choice_text_input();
    let oversized = renderer
        .prepare_frame_json_str(&oversized_input)
        .unwrap_err();
    match oversized {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.choices.choices[0].text");
            assert_eq!(validation.asset_name, (64 * 1024 + 1).to_string());
            assert!(validation.reason.contains("payload limits"));
        }
        other => panic!("expected oversized choice text validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_rich_text_payload_validation_rejects_unsafe_resolved_text_payloads() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let plain = renderer
        .prepare_frame_json_str(json_frame_with_control_character_dialogue_plain_text_input())
        .unwrap_err();
    match plain {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.text");
            assert_eq!(validation.asset_name, "Opening\u{1b}Line");
            assert!(validation.reason.contains("control characters"));
        }
        other => panic!("expected unsafe dialogue text validation error, got {other:?}"),
    }

    let span = renderer
        .prepare_frame_json_str(json_frame_with_control_character_dialogue_span_text_input())
        .unwrap_err();
    match span {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.dialogue.text.blocks[0].spans[0].text"
            );
            assert_eq!(validation.asset_name, "Bad\u{1b}Span");
            assert!(validation.reason.contains("control characters"));
        }
        other => panic!("expected unsafe rich text span validation error, got {other:?}"),
    }

    let oversized_input = json_frame_with_oversized_dialogue_rich_text_input();
    let oversized = renderer
        .prepare_frame_json_str(&oversized_input)
        .unwrap_err();
    match oversized {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.text");
            assert_eq!(validation.asset_name, (64 * 1024 + 1).to_string());
            assert!(validation.reason.contains("text payload limits"));
        }
        other => panic!("expected oversized rich text validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_dialogue_projection_validation_requires_explicit_mode() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_missing_dialogue_mode_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.mode");
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("explicitly provided"));
        }
        other => panic!("expected missing dialogue mode validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_rich_text_number_validation_rejects_unsafe_resolved_values() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let speaker_font_size = renderer
        .prepare_frame_json_str(json_frame_with_zero_dialogue_speaker_font_size_input())
        .unwrap_err();
    match speaker_font_size {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.speakerStyle.fontSize");
            assert_eq!(validation.asset_name, "0");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe dialogue speaker font size error, got {other:?}"),
    }

    let text_line_height = renderer
        .prepare_frame_json_str(json_frame_with_oversized_dialogue_line_height_input())
        .unwrap_err();
    match text_line_height {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.dialogue.text.style.lineHeight");
            assert_eq!(validation.asset_name, "1000001");
            assert!(validation.reason.contains("logical limits"));
        }
        other => panic!("expected unsafe dialogue line height error, got {other:?}"),
    }

    let span_font_size = renderer
        .prepare_frame_json_str(json_frame_with_zero_dialogue_span_font_size_input())
        .unwrap_err();
    match span_font_size {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.dialogue.text.blocks[0].spans[0].style.fontSize"
            );
            assert_eq!(validation.asset_name, "0");
            assert!(validation.reason.contains("greater than 0"));
        }
        other => panic!("expected unsafe dialogue span font size error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
