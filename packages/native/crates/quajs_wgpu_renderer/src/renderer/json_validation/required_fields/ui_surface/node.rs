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

    super::super::assets::validate_asset_projection_required_fields(
        node_object.get("image").unwrap_or(&Value::Null),
        &format!("{path}.image"),
        "native UI image resources",
        errors,
    );
    if !errors.is_empty() {
        return;
    }

    validate_ui_surface_node_style_shape_required_fields(node_object.get("style"), path, errors);
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
