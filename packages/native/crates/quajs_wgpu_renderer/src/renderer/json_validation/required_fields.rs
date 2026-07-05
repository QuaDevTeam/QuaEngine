use serde_json::Value;

use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};

mod ui_surface;

pub(crate) fn validate_json_frame_required_fields(
    input: &Value,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut errors = Vec::new();
    validate_top_level_required_fields(input, &mut errors);
    validate_dialogue_required_fields(input, &mut errors);
    validate_character_required_fields(input, &mut errors);
    validate_choices_required_fields(input, &mut errors);
    validate_ui_projection_required_fields(input, &mut errors);
    ui_surface::validate_ui_surface_required_fields(input, &mut errors);
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
