use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_ui_surface_node_kind_required_fields(
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

pub(super) fn is_native_ui_intent_surface_kind(kind: &str) -> bool {
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

pub(super) fn is_native_ui_leaf_surface_kind(kind: &str) -> bool {
    matches!(kind, "Divider" | "Image" | "RichText" | "Spacer" | "Text")
}
