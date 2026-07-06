use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::assets::validate_asset_projection_required_fields;

pub(super) fn validate_dialogue_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(dialogue) = input.get("view").and_then(|view| view.get("dialogue")) else {
        return;
    };
    let Some(dialogue_object) = dialogue.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.dialogue".to_string(),
            asset_name: String::new(),
            reason: "must be an object for native dialogue projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    for field in ["visible", "mode"] {
        if missing_or_null(dialogue_object.get(field)) {
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

    validate_avatar_required_fields(dialogue_object.get("avatar"), errors);
}

fn validate_avatar_required_fields(
    avatar: Option<&Value>,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(avatar) = avatar else {
        return;
    };
    validate_asset_projection_required_fields(
        avatar,
        "view.dialogue.avatar",
        "dialogue avatar image resources",
        errors,
    );
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
