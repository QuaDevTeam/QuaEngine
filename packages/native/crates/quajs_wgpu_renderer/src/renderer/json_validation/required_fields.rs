use serde_json::Value;

use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};

pub(crate) fn validate_json_frame_required_fields(
    input: &Value,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut errors = Vec::new();
    validate_ui_surface_required_fields(input, &mut errors);
    if let Some(error) = errors.into_iter().next() {
        return Err(NativeRendererJsonFrameError::Validation(error));
    }
    Ok(())
}

fn validate_ui_surface_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(overlays) = input
        .get("view")
        .and_then(|view| view.get("ui"))
        .and_then(|ui| ui.get("overlays"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for (overlay_index, overlay) in overlays.iter().enumerate() {
        validate_surface_root_required_fields(
            overlay.get("surface"),
            &format!("view.ui.overlays[{overlay_index}].surface"),
            errors,
        );
        validate_surface_root_required_fields(
            overlay.get("scene").and_then(|scene| scene.get("surface")),
            &format!("view.ui.overlays[{overlay_index}].scene.surface"),
            errors,
        );
    }
}

fn validate_surface_root_required_fields(
    surface: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(root) = surface.and_then(|surface| surface.get("root")) else {
        return;
    };
    if root.is_null() {
        return;
    }
    validate_ui_surface_node_required_fields(root, &format!("{path}.root"), errors);
}

fn validate_ui_surface_node_required_fields(
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

    let Some(children) = node_object.get("children").and_then(Value::as_array) else {
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
