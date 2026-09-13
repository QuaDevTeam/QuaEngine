use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

mod bounds;
mod children;
mod intent_target;
mod kind;
mod style;

use bounds::validate_ui_surface_node_bounds_required_fields;
use children::{
    validate_ui_surface_node_children_shape_required_fields,
    validate_ui_surface_node_content_model_required_fields,
};
use intent_target::validate_ui_surface_node_intent_target_required_fields;
use kind::validate_ui_surface_node_kind_required_fields;
use style::validate_ui_surface_node_style_shape_required_fields;

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

    if let Some(image) = node_object.get("image") {
        super::super::assets::validate_asset_projection_required_fields(
            image,
            &format!("{path}.image"),
            "native UI image resources",
            errors,
        );
        if !errors.is_empty() {
            return;
        }
    }

    validate_ui_surface_node_style_shape_required_fields(node_object.get("style"), path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_state_styles_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_transitions_required_fields(node_object, path, errors);
    if !errors.is_empty() {
        return;
    }

    if let Some(background_image) = node_object
        .get("style")
        .and_then(|style| style.get("backgroundImage"))
    {
        super::super::assets::validate_asset_projection_required_fields(
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

fn validate_ui_surface_node_state_styles_required_fields(
    node: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(value) = node.get("stateStyles") else {
        return;
    };
    let Some(states) = value.as_object() else {
        push_shape_error(errors, format!("{path}.stateStyles"), "must be an object");
        return;
    };
    for (state, value) in states {
        if !matches!(
            state.as_str(),
            "active" | "focus" | "focus-visible" | "hover"
        ) {
            push_shape_error(
                errors,
                format!("{path}.stateStyles.{state}"),
                "is not a supported native interactive pseudo-state",
            );
            return;
        }
        let Some(state_style) = value.as_object() else {
            push_shape_error(
                errors,
                format!("{path}.stateStyles.{state}"),
                "must be an object",
            );
            return;
        };
        for field in state_style.keys() {
            if !matches!(field.as_str(), "bounds" | "style") {
                push_shape_error(
                    errors,
                    format!("{path}.stateStyles.{state}.{field}"),
                    "is not a supported native pseudo-state projection field",
                );
                return;
            }
        }
        let state_path = format!("{path}.stateStyles.{state}");
        validate_ui_surface_node_bounds_required_fields(
            state_style.get("bounds"),
            &state_path,
            errors,
        );
        if !errors.is_empty() {
            return;
        }
        validate_ui_surface_node_style_shape_required_fields(
            state_style.get("style"),
            &state_path,
            errors,
        );
        if !errors.is_empty() {
            return;
        }
    }
}

fn validate_ui_surface_node_transitions_required_fields(
    node: &serde_json::Map<String, Value>,
    path: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(value) = node.get("transitions") else {
        return;
    };
    let Some(transitions) = value.as_array() else {
        push_shape_error(errors, format!("{path}.transitions"), "must be an array");
        return;
    };
    if transitions.len() > 10 {
        push_shape_error(
            errors,
            format!("{path}.transitions"),
            "must contain at most ten native transition entries",
        );
        return;
    }
    for (index, transition) in transitions.iter().enumerate() {
        let transition_path = format!("{path}.transitions[{index}]");
        let Some(transition) = transition.as_object() else {
            push_shape_error(errors, transition_path, "must be an object");
            return;
        };
        for field in transition.keys() {
            if !matches!(field.as_str(), "property" | "durationMs" | "easing") {
                push_shape_error(
                    errors,
                    format!("{transition_path}.{field}"),
                    "is not a supported native transition field",
                );
                return;
            }
        }
        for field in ["property", "durationMs", "easing"] {
            if transition.get(field).is_none_or(Value::is_null) {
                push_shape_error(
                    errors,
                    format!("{transition_path}.{field}"),
                    "must be explicitly provided for native transitions",
                );
                return;
            }
        }
    }
}

fn push_shape_error(
    errors: &mut Vec<NativeRendererJsonValidationError>,
    path: String,
    reason: &str,
) {
    errors.push(NativeRendererJsonValidationError {
        path,
        asset_name: String::new(),
        reason: reason.to_string(),
    });
}
