use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_background_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(background) = input.get("view").and_then(|view| view.get("background")) else {
        return;
    };
    if background.is_null() {
        return;
    }
    let Some(background_object) = background.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background".to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native background projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    if missing_or_null(background_object.get("mode")) {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background.mode".to_string(),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native background projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    }

    validate_background_layers_required_fields(background_object, errors);
    validate_background_video_required_fields(background_object, errors);
}

fn validate_background_layers_required_fields(
    background_object: &serde_json::Map<String, Value>,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let layers_value = background_object.get("layers");
    if background_object
        .get("mode")
        .and_then(Value::as_str)
        .is_some_and(|mode| mode == "layered")
        && missing_or_null(layers_value)
    {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background.layers".to_string(),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native layered background projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    }

    let Some(layers_value) = layers_value.filter(|value| !value.is_null()) else {
        return;
    };

    let Some(layers) = layers_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background.layers".to_string(),
            asset_name: String::new(),
            reason:
                "must be an array for native background layer projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for (layer_index, layer) in layers.iter().enumerate() {
        let layer_path = format!("view.background.layers[{layer_index}]");
        let Some(layer_object) = layer.as_object() else {
            errors.push(NativeRendererJsonValidationError {
                path: layer_path,
                asset_name: String::new(),
                reason:
                    "must be an object for native background layer projections in resolved projection JSON"
                        .to_string(),
            });
            return;
        };

        for field in ["id", "assetName"] {
            if missing_or_null(layer_object.get(field)) {
                errors.push(NativeRendererJsonValidationError {
                    path: format!("{layer_path}.{field}"),
                    asset_name: String::new(),
                    reason: "must be explicitly provided for native background layer projections in resolved projection JSON".to_string(),
                });
                return;
            }
        }
    }
}

fn validate_background_video_required_fields(
    background_object: &serde_json::Map<String, Value>,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(video) = background_object
        .get("video")
        .filter(|value| !value.is_null())
    else {
        return;
    };

    let Some(video_object) = video.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background.video".to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native background video projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    if missing_or_null(video_object.get("assetName")) {
        errors.push(NativeRendererJsonValidationError {
            path: "view.background.video.assetName".to_string(),
            asset_name: String::new(),
            reason:
                "must be explicitly provided for native background video projections in resolved projection JSON"
                    .to_string(),
        });
    }
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
