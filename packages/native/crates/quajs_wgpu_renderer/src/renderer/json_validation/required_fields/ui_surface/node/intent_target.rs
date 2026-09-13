use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::kind::is_native_ui_intent_surface_kind;

pub(super) fn validate_ui_surface_node_intent_target_required_fields(
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
