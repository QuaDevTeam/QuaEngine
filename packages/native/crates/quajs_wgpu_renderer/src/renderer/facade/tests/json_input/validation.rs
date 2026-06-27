use super::super::*;
use super::fixtures::*;
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

#[test]
fn json_frame_provenance_validation_rejects_unsafe_package_ids() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background = renderer
        .prepare_frame_json_str(json_frame_with_remote_provenance_package_input())
        .unwrap_err();
    match background {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.background.provenance.contentPackageId"
            );
            assert_eq!(validation.asset_name, "https://example.invalid/runtime.ui");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected background provenance validation error, got {other:?}"),
    }

    let ui = renderer
        .prepare_frame_json_str(json_frame_with_traversal_required_package_input())
        .unwrap_err();
    match ui {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.provenance.requiredRuntimePackages[0]"
            );
            assert_eq!(validation.asset_name, "../base");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected UI provenance validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

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

#[test]
fn json_frame_intent_validation_rejects_choice_select_without_canonical_choice_id() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let error = renderer
        .prepare_frame_json_str(json_frame_with_forged_choice_metadata_input())
        .unwrap_err();

    match error {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "");
            assert!(validation.reason.contains("canonical choiceId"));
        }
        other => panic!("expected validation error, got {other:?}"),
    }
    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_intent_validation_rejects_unsafe_dispatch_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_overlay_element_id_input())
        .unwrap_err();
    match overlay {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].elementId");
            assert_eq!(validation.asset_name, "../menu");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected overlay element id validation error, got {other:?}"),
    }

    let node = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_surface_node_id_input())
        .unwrap_err();
    match node {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].surface.root.id");
            assert_eq!(validation.asset_name, "file:///tmp/native.node");
            assert!(validation.reason.contains("URLs") || validation.reason.contains("URI"));
        }
        other => panic!("expected surface node id validation error, got {other:?}"),
    }

    let scene = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_scene_id_input())
        .unwrap_err();
    match scene {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].scene.id");
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected scene id validation error, got {other:?}"),
    }

    let action = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_ui_intent_action_input())
        .unwrap_err();
    match action {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.action"
            );
            assert_eq!(validation.asset_name, "native:load-plugin");
            assert!(validation.reason.contains("URI"));
        }
        other => panic!("expected UI intent action validation error, got {other:?}"),
    }

    let choice = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_choice_id_input())
        .unwrap_err();
    match choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "choices/native.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected choice id validation error, got {other:?}"),
    }

    let native_payload_choice = renderer
        .prepare_frame_json_str(json_frame_with_native_payload_choice_id_input())
        .unwrap_err();
    match native_payload_choice {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.intent.choiceId"
            );
            assert_eq!(validation.asset_name, "native.dll");
            assert!(validation.reason.contains("native payloads"));
        }
        other => panic!("expected native payload choice id validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_ui_validation_rejects_unsafe_overlay_stack_names() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay_stack = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_overlay_stack_input())
        .unwrap_err();
    match overlay_stack {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[0].overlayStack");
            assert_eq!(validation.asset_name, "native/load.dll");
            assert!(validation.reason.contains("paths"));
        }
        other => panic!("expected overlay stack validation error, got {other:?}"),
    }

    let scene_overlay_stack = renderer
        .prepare_frame_json_str(json_frame_with_unsafe_scene_overlay_stack_input())
        .unwrap_err();
    match scene_overlay_stack {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].scene.overlay.overlayStack"
            );
            assert_eq!(validation.asset_name, "https://example.invalid/stack");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected scene overlay stack validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

#[test]
fn json_frame_intent_validation_rejects_duplicate_ui_dispatch_identifiers() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let overlay = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_overlay_element_id_input())
        .unwrap_err();
    match overlay {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[1].elementId");
            assert_eq!(validation.asset_name, "menu");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate overlay id validation error, got {other:?}"),
    }

    let node = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_surface_node_id_input())
        .unwrap_err();
    match node {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.children[0].id"
            );
            assert_eq!(validation.asset_name, "root");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate surface node id validation error, got {other:?}"),
    }

    let scene = renderer
        .prepare_frame_json_str(json_frame_with_duplicate_scene_id_input())
        .unwrap_err();
    match scene {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(validation.path, "view.ui.overlays[1].scene.id");
            assert_eq!(validation.asset_name, "settings");
            assert!(validation.reason.contains("unique"));
        }
        other => panic!("expected duplicate scene id validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}

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
