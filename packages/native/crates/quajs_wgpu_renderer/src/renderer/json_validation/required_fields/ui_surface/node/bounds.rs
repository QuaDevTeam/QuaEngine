use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_ui_surface_node_bounds_required_fields(
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
