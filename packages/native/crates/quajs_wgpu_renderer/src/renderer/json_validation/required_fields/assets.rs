use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_asset_projection_required_fields(
    asset: &Value,
    path: &str,
    noun: &str,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(asset_object) = asset.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: path.to_string(),
            asset_name: String::new(),
            reason: format!(
                "must be an object when provided for {noun} in resolved projection JSON"
            ),
        });
        return;
    };
    if missing_or_null(asset_object.get("assetType")) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.assetType"),
            asset_name: String::new(),
            reason: format!("must be explicitly provided for {noun} in resolved projection JSON"),
        });
    }
    if missing_or_null(asset_object.get("assetName")) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.assetName"),
            asset_name: String::new(),
            reason: format!("must be explicitly provided for {noun} in resolved projection JSON"),
        });
    }
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
