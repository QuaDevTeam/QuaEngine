use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::kind::is_native_ui_leaf_surface_kind;

pub(super) fn validate_ui_surface_node_children_shape_required_fields(
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

pub(super) fn validate_ui_surface_node_content_model_required_fields(
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
