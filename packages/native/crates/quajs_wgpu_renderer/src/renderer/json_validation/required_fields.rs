use serde_json::Value;

use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};

pub(crate) fn validate_json_frame_required_fields(
    input: &Value,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut errors = Vec::new();
    validate_top_level_required_fields(input, &mut errors);
    validate_dialogue_required_fields(input, &mut errors);
    validate_character_required_fields(input, &mut errors);
    validate_choices_required_fields(input, &mut errors);
    validate_ui_projection_required_fields(input, &mut errors);
    validate_ui_surface_required_fields(input, &mut errors);
    validate_audio_track_required_fields(input, &mut errors);
    if let Some(error) = errors.into_iter().next() {
        return Err(NativeRendererJsonFrameError::Validation(error));
    }
    Ok(())
}

fn validate_top_level_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let missing_view = match input.get("view") {
        Some(value) => value.is_null(),
        None => true,
    };
    if missing_view {
        errors.push(NativeRendererJsonValidationError {
            path: "view".to_string(),
            asset_name: String::new(),
            reason: "must be explicitly provided for native renderer frame projection JSON"
                .to_string(),
        });
    }
}

fn validate_dialogue_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(dialogue) = input.get("view").and_then(|view| view.get("dialogue")) else {
        return;
    };
    if dialogue.is_null() {
        return;
    }
    let Some(dialogue_object) = dialogue.as_object() else {
        return;
    };

    for field in ["visible", "mode"] {
        let missing = match dialogue_object.get(field) {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.dialogue.{field}"),
                asset_name: String::new(),
                reason:
                    "must be explicitly provided for native dialogue projections in resolved projection JSON"
                        .to_string(),
            });
            return;
        }
    }

    let Some(avatar) = dialogue_object.get("avatar") else {
        return;
    };
    if avatar.is_null() {
        return;
    }
    validate_asset_projection_required_fields(
        avatar,
        "view.dialogue.avatar",
        "dialogue avatar image resources",
        errors,
    );
}

fn validate_choices_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(choices) = input.get("view").and_then(|view| view.get("choices")) else {
        return;
    };
    if choices.is_null() {
        return;
    }
    let Some(choices_object) = choices.as_object() else {
        return;
    };

    for field in ["visible", "choices"] {
        let missing = match choices_object.get(field) {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.choices.{field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native choice set projections in resolved projection JSON".to_string(),
            });
            return;
        }
    }

    let Some(choice_items) = choices_object.get("choices").and_then(Value::as_array) else {
        return;
    };
    for (choice_index, choice) in choice_items.iter().enumerate() {
        let Some(choice_object) = choice.as_object() else {
            continue;
        };
        let missing_enabled = match choice_object.get("enabled") {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing_enabled {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.choices.choices[{choice_index}].enabled"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native choice projections in resolved projection JSON".to_string(),
            });
            return;
        }
    }
}

fn validate_character_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(characters) = input
        .get("view")
        .and_then(|view| view.get("characters"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for (character_index, character) in characters.iter().enumerate() {
        let Some(character_object) = character.as_object() else {
            continue;
        };
        let missing_visible = match character_object.get("visible") {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing_visible {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.characters[{character_index}].visible"),
                asset_name: String::new(),
                reason:
                    "must be explicitly provided for native character projections in resolved projection JSON"
                        .to_string(),
            });
            return;
        }
    }
}

fn validate_audio_track_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(tracks) = input
        .get("view")
        .and_then(|view| view.get("audio"))
        .and_then(|audio| audio.get("tracks"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for (track_index, track) in tracks.iter().enumerate() {
        let Some(track_object) = track.as_object() else {
            continue;
        };
        for field in ["assetType", "loadMode", "playbackState"] {
            let missing = match track_object.get(field) {
                Some(value) => value.is_null(),
                None => true,
            };
            if missing {
                errors.push(NativeRendererJsonValidationError {
                    path: format!("view.audio.tracks[{track_index}].{field}"),
                    asset_name: String::new(),
                    reason: "must be explicitly provided for native audio tracks in resolved projection JSON".to_string(),
                });
                return;
            }
        }
    }
}

fn validate_ui_projection_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(ui) = input.get("view").and_then(|view| view.get("ui")) else {
        return;
    };
    if ui.is_null() {
        return;
    }
    let Some(ui_object) = ui.as_object() else {
        return;
    };

    let missing_visible = match ui_object.get("visible") {
        Some(value) => value.is_null(),
        None => true,
    };
    if missing_visible {
        errors.push(NativeRendererJsonValidationError {
            path: "view.ui.visible".to_string(),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native UI projections in resolved projection JSON"
                    .to_string(),
        });
    }
}

fn validate_ui_surface_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(overlays) = input
        .get("view")
        .and_then(|view| view.get("ui"))
        .and_then(|ui| ui.get("overlays"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for (overlay_index, overlay) in overlays.iter().enumerate() {
        validate_ui_intent_required_fields(
            overlay.get("intent"),
            &format!("view.ui.overlays[{overlay_index}].intent"),
            errors,
        );
        validate_surface_root_required_fields(
            overlay.get("surface"),
            &format!("view.ui.overlays[{overlay_index}].surface"),
            errors,
        );
        validate_surface_root_required_fields(
            overlay.get("scene").and_then(|scene| scene.get("surface")),
            &format!("view.ui.overlays[{overlay_index}].scene.surface"),
            errors,
        );
    }
}

fn validate_ui_intent_required_fields(
    intent: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(intent) = intent else {
        return;
    };
    let Some(intent_object) = intent.as_object() else {
        return;
    };

    let missing_event = match intent_object.get("event") {
        Some(value) => value.is_null(),
        None => true,
    };
    if missing_event {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.event"),
            asset_name: String::new(),
            reason: "must be explicitly provided for native UI intents in resolved projection JSON"
                .to_string(),
        });
    }
}

fn validate_surface_root_required_fields(
    surface: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(root) = surface.and_then(|surface| surface.get("root")) else {
        return;
    };
    if root.is_null() {
        return;
    }
    validate_ui_surface_node_required_fields(root, &format!("{path}.root"), errors);
}

fn validate_ui_surface_node_required_fields(
    node: &Value,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(node_object) = node.as_object() else {
        return;
    };

    let missing_kind = match node_object.get("kind") {
        Some(kind) => kind.is_null(),
        None => true,
    };

    if missing_kind {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.kind"),
            asset_name: String::new(),
            reason: "must be explicitly provided for native UI surface nodes in resolved projection JSON".to_string(),
        });
        return;
    }

    validate_ui_surface_node_kind_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    let missing_visible = match node_object.get("visible") {
        Some(visible) => visible.is_null(),
        None => true,
    };

    if missing_visible {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.visible"),
            asset_name: String::new(),
            reason: "must be explicitly provided for native UI surface nodes in resolved projection JSON".to_string(),
        });
        return;
    }

    validate_ui_surface_node_bounds_required_fields(node_object.get("bounds"), path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_children_shape_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_content_model_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_intent_target_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_intent_required_fields(
        node_object.get("intent"),
        &format!("{path}.intent"),
        errors,
    );
    if !errors.is_empty() {
        return;
    }

    validate_asset_projection_required_fields(
        node_object.get("image").unwrap_or(&Value::Null),
        &format!("{path}.image"),
        "native UI image resources",
        errors,
    );
    if !errors.is_empty() {
        return;
    }

    if let Some(background_image) = node_object
        .get("style")
        .and_then(|style| style.get("backgroundImage"))
    {
        validate_asset_projection_required_fields(
            background_image,
            &format!("{path}.style.backgroundImage"),
            "native UI background image resources",
            errors,
        );
        if !errors.is_empty() {
            return;
        }
    }

    let Some(children_value) = node_object.get("children") else {
        return;
    };
    let Some(children) = children_value.as_array() else {
        return;
    };
    for (child_index, child) in children.iter().enumerate() {
        validate_ui_surface_node_required_fields(
            child,
            &format!("{path}.children[{child_index}]"),
            errors,
        );
        if !errors.is_empty() {
            return;
        }
    }
}

fn validate_ui_surface_node_children_shape_required_fields(
    node_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(children) = node_object.get("children") else {
        return;
    };
    if children.is_array() {
        return;
    }

    let kind = node_object
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    errors.push(NativeRendererJsonValidationError {
        path: format!("{path}.children"),
        asset_name: kind.to_string(),
        reason:
            "must be an array when provided for native UI surface nodes in resolved projection JSON"
                .to_string(),
    });
}

fn validate_ui_surface_node_kind_required_fields(
    node_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(kind) = node_object.get("kind").and_then(Value::as_str) else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.kind"),
            asset_name: String::new(),
            reason:
                "must be a supported native UI surface node kind string in resolved projection JSON"
                    .to_string(),
        });
        return;
    };
    if is_native_ui_surface_kind(kind) {
        return;
    }

    errors.push(NativeRendererJsonValidationError {
        path: format!("{path}.kind"),
        asset_name: kind.to_string(),
        reason: format!(
            "native UI surface node kind `{kind}` is not a supported foundational native-wgpu node kind in resolved projection JSON"
        ),
    });
}

fn validate_ui_surface_node_content_model_required_fields(
    node_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(kind) = node_object.get("kind").and_then(Value::as_str) else {
        return;
    };
    if !is_native_ui_leaf_surface_kind(kind) {
        return;
    }
    let Some(children) = node_object.get("children").and_then(Value::as_array) else {
        return;
    };
    if children.is_empty() {
        return;
    }

    errors.push(NativeRendererJsonValidationError {
        path: format!("{path}.children"),
        asset_name: kind.to_string(),
        reason: format!(
            "native UI surface node kind `{kind}` uses a leaf content model and cannot contain child nodes in resolved projection JSON"
        ),
    });
}

fn validate_ui_surface_node_bounds_required_fields(
    bounds: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(bounds) = bounds else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.bounds"),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native UI surface node bounds in resolved projection JSON"
                    .to_string(),
        });
        return;
    };
    if bounds.is_null() {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.bounds"),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native UI surface node bounds in resolved projection JSON"
                    .to_string(),
        });
        return;
    }
    let Some(bounds_object) = bounds.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.bounds"),
            asset_name: String::new(),
            reason: "must be an object when provided for native UI surface node bounds in resolved projection JSON".to_string(),
        });
        return;
    };

    for field in ["x", "y", "width", "height"] {
        let missing = match bounds_object.get(field) {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.bounds.{field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native UI surface node bounds in resolved projection JSON".to_string(),
            });
            return;
        }
    }
}

fn validate_ui_surface_node_intent_target_required_fields(
    node_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(intent) = node_object.get("intent") else {
        return;
    };
    if intent.is_null() {
        return;
    }
    let Some(kind) = node_object.get("kind").and_then(Value::as_str) else {
        return;
    };
    if is_native_ui_intent_surface_kind(kind) {
        return;
    }

    errors.push(NativeRendererJsonValidationError {
        path: format!("{path}.intent"),
        asset_name: kind.to_string(),
        reason: format!(
            "native UI surface node kind `{kind}` cannot project pointer intents in resolved projection JSON"
        ),
    });
}

fn is_native_ui_intent_surface_kind(kind: &str) -> bool {
    matches!(kind, "Backdrop" | "Box" | "Button" | "Panel")
}

fn is_native_ui_surface_kind(kind: &str) -> bool {
    matches!(
        kind,
        "Backdrop"
            | "Box"
            | "Button"
            | "Column"
            | "Divider"
            | "Fragment"
            | "Grid"
            | "Image"
            | "Layer"
            | "Panel"
            | "RichText"
            | "Row"
            | "SafeArea"
            | "Scroll"
            | "Spacer"
            | "Stack"
            | "Text"
    )
}

fn is_native_ui_leaf_surface_kind(kind: &str) -> bool {
    matches!(kind, "Divider" | "Image" | "RichText" | "Spacer" | "Text")
}

fn validate_asset_projection_required_fields(
    asset: &Value,
    path: &str,
    noun: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    if asset.is_null() {
        return;
    }
    let Some(asset_object) = asset.as_object() else {
        return;
    };
    let missing_asset_type = match asset_object.get("assetType") {
        Some(value) => value.is_null(),
        None => true,
    };
    if missing_asset_type {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.assetType"),
            asset_name: String::new(),
            reason: format!("must be explicitly provided for {noun} in resolved projection JSON"),
        });
    }
}
