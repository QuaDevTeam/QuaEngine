use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

mod node;

pub(super) fn validate_ui_surface_required_fields(
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
        validate_ui_intent_required_fields(
            overlay.get("intent"),
            &format!("view.ui.overlays[{overlay_index}].intent"),
            errors,
        );
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

pub(super) fn validate_ui_intent_required_fields(
    intent: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(intent) = intent else {
        return;
    };
    let Some(intent_object) = intent.as_object() else {
        return;
    };

    let missing_event = match intent_object.get("event") {
        Some(value) => value.is_null(),
        None => true,
    };
    if missing_event {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.event"),
            asset_name: String::new(),
            reason: "must be explicitly provided for native UI intents in resolved projection JSON"
                .to_string(),
        });
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
    node::validate_ui_surface_node_required_fields(root, &format!("{path}.root"), errors);
}
