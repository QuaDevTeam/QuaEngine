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

    for field in ["backgroundPosition", "objectPosition", "padding"] {
        let Some(value) = style_object.get(field).filter(|value| !value.is_null()) else {
            continue;
        };
        if value.is_object() {
            continue;
        }
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.style.{field}"),
            asset_name: String::new(),
            reason: format!(
                "must be an object when provided for native UI surface style {field} in resolved projection JSON"
            ),
        });
        return;
    }
}
