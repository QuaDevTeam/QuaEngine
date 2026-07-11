use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_ui_surface_node_style_shape_required_fields(
    style: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(style) = style else {
        return;
    };
    let Some(style_object) = style.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style"),
            asset_name: String::new(),
            reason:
                "must be an object when provided for native UI surface node styles in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for field in style_object.keys() {
        if is_native_ui_surface_style_field(field) {
            continue;
        }
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.{field}"),
            asset_name: field.to_string(),
            reason: "is not a supported native UI surface style field in resolved projection JSON"
                .to_string(),
        });
        return;
    }

    validate_position_object_field(style_object, path, "backgroundPosition", errors);
    if !errors.is_empty() {
        return;
    }
    validate_position_object_field(style_object, path, "objectPosition", errors);
    if !errors.is_empty() {
        return;
    }
    validate_shadow_object_field(style_object, path, "boxShadow", errors);
    if !errors.is_empty() {
        return;
    }
    validate_shadow_object_field(style_object, path, "textShadow", errors);
    if !errors.is_empty() {
        return;
    }
    validate_object_field(
        style_object,
        path,
        "padding",
        is_native_ui_surface_padding_field,
        errors,
    );
}

fn validate_shadow_object_field(
    style_object: &serde_json::Map<String, Value>,
    path: &str,
    field: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(shadow_object) = validate_object_field(
        style_object,
        path,
        field,
        is_native_ui_surface_shadow_field,
        errors,
    ) else {
        return;
    };
    for required_field in ["offsetX", "offsetY", "color"] {
        let missing = match shadow_object.get(required_field) {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.{field}.{required_field}"),
                asset_name: String::new(),
                reason: format!(
                    "must be explicitly provided for native UI surface style {field} in resolved projection JSON"
                ),
            });
            return;
        }
    }
}

fn validate_position_object_field(
    style_object: &serde_json::Map<String, Value>,
    path: &str,
    field: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(position_object) = validate_object_field(
        style_object,
        path,
        field,
        is_native_ui_surface_position_field,
        errors,
    ) else {
        return;
    };
    for axis in ["x", "y"] {
        let missing_axis = match position_object.get(axis) {
            Some(value) => value.is_null(),
            None => true,
        };
        if missing_axis {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.{field}.{axis}"),
                asset_name: String::new(),
                reason: format!(
                    "must be explicitly provided for native UI surface style {field} in resolved projection JSON"
                ),
            });
            return;
        }
    }
}

fn validate_object_field<'a>(
    style_object: &'a serde_json::Map<String, Value>,
    path: &str,
    field: &str,
    is_supported_field: fn(&str) -> bool,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) -> Option<&'a serde_json::Map<String, Value>> {
    let Some(value) = style_object.get(field) else {
        return None;
    };
    let Some(field_object) = value.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.{field}"),
            asset_name: String::new(),
            reason: format!(
                "must be an object when provided for native UI surface style {field} in resolved projection JSON"
            ),
        });
        return None;
    };
    for child_field in field_object.keys() {
        if is_supported_field(child_field) {
            continue;
        }
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.{field}.{child_field}"),
            asset_name: child_field.to_string(),
            reason: format!(
                "is not a supported native UI surface style {field} field in resolved projection JSON"
            ),
        });
        return None;
    }
    Some(field_object)
}

fn is_native_ui_surface_style_field(field: &str) -> bool {
    matches!(
        field,
        "backgroundColor"
            | "backgroundImage"
            | "backgroundPosition"
            | "backgroundSize"
            | "borderColor"
            | "borderRadius"
            | "borderStyle"
            | "borderWidth"
            | "boxShadow"
            | "color"
            | "fontFamily"
            | "fontSize"
            | "fontStyle"
            | "fontWeight"
            | "letterSpacing"
            | "lineHeight"
            | "objectFit"
            | "objectPosition"
            | "opacity"
            | "padding"
            | "textAlign"
            | "textDecoration"
            | "textOverflow"
            | "textShadow"
            | "textTransform"
            | "whiteSpace"
    )
}

fn is_native_ui_surface_shadow_field(field: &str) -> bool {
    matches!(
        field,
        "offsetX" | "offsetY" | "blurRadius" | "spreadRadius" | "color"
    )
}

fn is_native_ui_surface_position_field(field: &str) -> bool {
    matches!(field, "x" | "y")
}

fn is_native_ui_surface_padding_field(field: &str) -> bool {
    matches!(field, "top" | "right" | "bottom" | "left")
}
