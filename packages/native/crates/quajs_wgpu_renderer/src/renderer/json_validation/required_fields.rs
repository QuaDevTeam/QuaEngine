use serde_json::Value;

use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};

mod assets;
mod audio;
mod background;
mod choices;
mod dialogue;
mod fonts;
mod ui_surface;

pub(crate) fn validate_json_frame_required_fields(
    input: &Value,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut errors = Vec::new();
    validate_top_level_required_fields(input, &mut errors);
    background::validate_background_required_fields(input, &mut errors);
    dialogue::validate_dialogue_required_fields(input, &mut errors);
    validate_character_required_fields(input, &mut errors);
    choices::validate_choices_required_fields(input, &mut errors);
    validate_ui_projection_required_fields(input, &mut errors);
    ui_surface::validate_ui_surface_required_fields(input, &mut errors);
    audio::validate_audio_track_required_fields(input, &mut errors);
    fonts::validate_fonts_required_fields(input, &mut errors);
    if let Some(error) = errors.into_iter().next() {
        return Err(NativeRendererJsonFrameError::Validation(error));
    }
    Ok(())
}

fn validate_top_level_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    match input.get("view") {
        Some(value) if value.is_null() => {
            errors.push(NativeRendererJsonValidationError {
                path: "view".to_string(),
                asset_name: String::new(),
                reason: "must be explicitly provided for native renderer frame projection JSON"
                    .to_string(),
            });
        }
        Some(value) if !value.is_object() => {
            errors.push(NativeRendererJsonValidationError {
                path: "view".to_string(),
                asset_name: String::new(),
                reason: "must be an object for native renderer frame projection JSON".to_string(),
            });
        }
        Some(_) => {}
        None => {
            errors.push(NativeRendererJsonValidationError {
                path: "view".to_string(),
                asset_name: String::new(),
                reason: "must be explicitly provided for native renderer frame projection JSON"
                    .to_string(),
            });
        }
    }
}

fn validate_character_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(characters_value) = input.get("view").and_then(|view| view.get("characters")) else {
        return;
    };
    let Some(characters) = characters_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.characters".to_string(),
            asset_name: String::new(),
            reason: "must be an array for native character projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    for (character_index, character) in characters.iter().enumerate() {
        let Some(character_object) = character.as_object() else {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.characters[{character_index}]"),
                asset_name: String::new(),
                reason:
                    "must be an object for native character projections in resolved projection JSON"
                        .to_string(),
            });
            return;
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

fn validate_ui_projection_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(ui) = input.get("view").and_then(|view| view.get("ui")) else {
        return;
    };
    let Some(ui_object) = ui.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.ui".to_string(),
            asset_name: String::new(),
            reason: "must be an object for native UI projections in resolved projection JSON"
                .to_string(),
        });
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
