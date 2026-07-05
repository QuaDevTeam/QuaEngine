use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_ui_surface_node_required_fields(
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

    super::validate_ui_intent_required_fields(
        node_object.get("intent"),
        &format!("{path}.intent"),
        errors,
    );
    if !errors.is_empty() {
        return;
    }

    super::super::validate_asset_projection_required_fields(
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
        super::super::validate_asset_projection_required_fields(
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
