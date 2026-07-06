use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

mod node;

pub(super) fn validate_ui_surface_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(ui) = input.get("view").and_then(|view| view.get("ui")) else {
        return;
    };
    if ui.is_null() {
        return;
    }
    let Some(ui_object) = ui.as_object() else {
        return;
    };
    let Some(overlays_value) = ui_object.get("overlays") else {
        return;
    };
    let Some(overlays) = overlays_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.ui.overlays".to_string(),
            asset_name: String::new(),
            reason:
                "must be an array for native UI overlay projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for (overlay_index, overlay) in overlays.iter().enumerate() {
        validate_ui_overlay_required_fields(
            overlay,
            &format!("view.ui.overlays[{overlay_index}]"),
            errors,
        );
        if !errors.is_empty() {
            return;
        }
    }
}

fn validate_ui_overlay_required_fields(
    overlay: &Value,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(overlay_object) = overlay.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: path.to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native UI overlay projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    validate_ui_intent_required_fields(
        overlay_object.get("intent"),
        &format!("{path}.intent"),
        errors,
    );
    if !errors.is_empty() {
        return;
    }
    validate_surface_root_required_fields(
        overlay_object.get("surface"),
        &format!("{path}.surface"),
        errors,
    );
    if !errors.is_empty() {
        return;
    }
    validate_scene_surface_required_fields(
        overlay_object.get("scene"),
        &format!("{path}.scene"),
        errors,
    );
}

fn validate_scene_surface_required_fields(
    scene: Option<&Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(scene) = scene else {
        return;
    };
    if scene.is_null() {
        return;
    }
    let Some(scene_object) = scene.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: path.to_string(),
            asset_name: String::new(),
            reason: "must be an object for native UI scene projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };
    validate_surface_root_required_fields(
        scene_object.get("surface"),
        &format!("{path}.surface"),
        errors,
    );
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
        errors.push(NativeRendererJsonValidationError {
            path: path.to_string(),
            asset_name: String::new(),
            reason: "must be an object for native UI intents in resolved projection JSON"
                .to_string(),
        });
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
    let Some(surface) = surface else {
        return;
    };
    if surface.is_null() {
        return;
    }
    let Some(surface_object) = surface.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: path.to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native UI surface projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };
    let Some(root) = surface_object.get("root") else {
        return;
    };
    if root.is_null() {
        return;
    }
    if !root.is_object() {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.root"),
            asset_name: String::new(),
            reason:
                "must be an object for native UI surface root nodes in resolved projection JSON"
                    .to_string(),
        });
        return;
    }
    node::validate_ui_surface_node_required_fields(root, &format!("{path}.root"), errors);
}
