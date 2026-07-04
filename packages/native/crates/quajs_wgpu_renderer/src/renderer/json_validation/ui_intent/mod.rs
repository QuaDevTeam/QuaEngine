mod metadata;

use crate::projection::ui::UiIntentProjection;
use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::safe_strings::invalid_native_json_ui_dispatch_identifier_reason;
use metadata::invalid_native_json_ui_intent_metadata_reason;

pub(super) fn validate_native_json_ui_intent_projection(
    path: &str,
    intent: &UiIntentProjection,
) -> Vec<NativeRendererJsonValidationError> {
    let mut errors = Vec::new();

    if let Some(reason) = invalid_native_json_ui_intent_event_reason(&intent.event) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.event"),
            asset_name: intent.event.clone(),
            reason,
        });
        return errors;
    }

    if let Some(action) = &intent.action {
        if let Some(reason) =
            invalid_native_json_ui_dispatch_identifier_reason(action, "UI intent actions")
        {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.action"),
                asset_name: action.to_string(),
                reason,
            });
        }
    }

    if let Some((field, value, reason)) =
        invalid_native_json_ui_intent_metadata_reason(&intent.metadata)
    {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.{field}"),
            asset_name: value,
            reason,
        });
    }

    if intent.event != "choice/select" {
        if let Some(choice_id) = &intent.choice_id {
            validate_choice_id(path, choice_id, &mut errors);
        }
        return errors;
    }

    match intent.choice_id.as_deref() {
        Some(choice_id) if !choice_id.trim().is_empty() => {
            validate_choice_id(path, choice_id, &mut errors);
        }
        _ => errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.choiceId"),
            asset_name: intent.choice_id.clone().unwrap_or_default(),
            reason: "choice/select intents must declare canonical choiceId".to_string(),
        }),
    }

    errors
}

fn validate_choice_id(
    path: &str,
    choice_id: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    if let Some(reason) = invalid_native_json_ui_dispatch_identifier_reason(choice_id, "choice ids")
    {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.choiceId"),
            asset_name: choice_id.to_string(),
            reason,
        });
    }
}

fn invalid_native_json_ui_intent_event_reason(event: &str) -> Option<String> {
    match event {
        "ui/intent" | "choice/select" => None,
        _ => Some("UI surface intent events must be ui/intent or choice/select".to_string()),
    }
}
