use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_choices_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(choices) = input.get("view").and_then(|view| view.get("choices")) else {
        return;
    };
    let Some(choices_object) = choices.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.choices".to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native choice set projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for field in ["visible", "choices"] {
        if missing_or_null(choices_object.get(field)) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.choices.{field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native choice set projections in resolved projection JSON".to_string(),
            });
            return;
        }
    }

    validate_choice_items_required_fields(choices_object.get("choices"), errors);
}

fn validate_choice_items_required_fields(
    choice_items_value: Option<&Value>,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(choice_items_value) = choice_items_value else {
        return;
    };
    let Some(choice_items) = choice_items_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.choices.choices".to_string(),
            asset_name: String::new(),
            reason:
                "must be an array for native choice set projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for (choice_index, choice) in choice_items.iter().enumerate() {
        let previous_error_count = errors.len();
        validate_choice_required_fields(choice_index, choice, errors);
        if errors.len() > previous_error_count {
            return;
        }
    }
}

fn validate_choice_required_fields(
    choice_index: usize,
    choice: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(choice_object) = choice.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("view.choices.choices[{choice_index}]"),
            asset_name: String::new(),
            reason: "must be an object for native choice projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    if missing_or_null(choice_object.get("enabled")) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("view.choices.choices[{choice_index}].enabled"),
            asset_name: String::new(),
            reason: "must be explicitly provided for native choice projections in resolved projection JSON"
                .to_string(),
        });
    }
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
