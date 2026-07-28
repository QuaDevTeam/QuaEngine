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
    validate_gradient_object_field(style_object, path, errors);
    if !errors.is_empty() {
        return;
    }
    validate_filter_object_field(style_object, path, errors);
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

fn validate_gradient_object_field(
    style_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(gradient) = validate_object_field(
        style_object,
        path,
        "backgroundGradient",
        is_native_ui_surface_gradient_field,
        errors,
    ) else {
        return;
    };
    let required_fields: &[&str] = match gradient.get("kind").and_then(Value::as_str) {
        Some("linear") => &["kind", "angleDegrees", "stops"],
        Some("radial") => &["kind", "centerX", "centerY", "radius", "shape", "stops"],
        _ => &["kind", "stops"],
    };
    for required_field in required_fields {
        if gradient.get(*required_field).is_none_or(Value::is_null) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.backgroundGradient.{required_field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native UI surface backgroundGradient in resolved projection JSON".to_string(),
            });
            return;
        }
    }

    let Some(stops) = gradient.get("stops").and_then(Value::as_array) else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.backgroundGradient.stops"),
            asset_name: String::new(),
            reason: "must be an array for native UI surface backgroundGradient stops".to_string(),
        });
        return;
    };
    if !(2..=8).contains(&stops.len()) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.backgroundGradient.stops"),
            asset_name: stops.len().to_string(),
            reason: "must contain between 2 and 8 resolved color stops".to_string(),
        });
        return;
    }
    for (index, stop) in stops.iter().enumerate() {
        let Some(stop) = stop.as_object() else {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.backgroundGradient.stops[{index}]"),
                asset_name: String::new(),
                reason: "must be an object with color and position fields".to_string(),
            });
            return;
        };
        for field in stop.keys() {
            if matches!(field.as_str(), "color" | "position") {
                continue;
            }
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.backgroundGradient.stops[{index}].{field}"),
                asset_name: field.to_string(),
                reason: "is not a supported native UI surface gradient stop field".to_string(),
            });
            return;
        }
        for required_field in ["color", "position"] {
            if stop.get(required_field).is_none_or(Value::is_null) {
                errors.push(NativeRendererJsonValidationError {
                    path: format!(
                        "{path}.style.backgroundGradient.stops[{index}].{required_field}"
                    ),
                    asset_name: String::new(),
                    reason: "must be explicitly provided for every native UI surface gradient stop"
                        .to_string(),
                });
                return;
            }
        }
    }
}

fn validate_filter_object_field(
    style_object: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(filter) = validate_object_field(
        style_object,
        path,
        "filter",
        is_native_ui_surface_filter_field,
        errors,
    ) else {
        return;
    };
    for required_field in ["brightness", "saturate"] {
        if filter.get(required_field).is_none_or(Value::is_null) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.style.filter.{required_field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native UI surface filter in resolved projection JSON".to_string(),
            });
            return;
        }
    }
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
    for required_field in [
        "offsetX",
        "offsetY",
        "blurRadius",
        "spreadRadius",
        "color",
        "inset",
    ] {
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
            | "backgroundGradient"
            | "filter"
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
        "offsetX" | "offsetY" | "blurRadius" | "spreadRadius" | "color" | "inset"
    )
}

fn is_native_ui_surface_gradient_field(field: &str) -> bool {
    matches!(
        field,
        "kind" | "angleDegrees" | "centerX" | "centerY" | "radius" | "shape" | "stops"
    )
}

fn is_native_ui_surface_filter_field(field: &str) -> bool {
    matches!(field, "brightness" | "saturate")
}

fn is_native_ui_surface_position_field(field: &str) -> bool {
    matches!(field, "x" | "y")
}

fn is_native_ui_surface_padding_field(field: &str) -> bool {
    matches!(field, "top" | "right" | "bottom" | "left")
}
