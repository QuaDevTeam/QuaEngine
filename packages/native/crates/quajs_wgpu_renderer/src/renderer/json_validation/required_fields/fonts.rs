use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_fonts_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(fonts) = input
        .get("view")
        .and_then(|view| view.get("plugins"))
        .and_then(|plugins| plugins.get("fonts"))
    else {
        return;
    };
    let Some(fonts_object) = fonts.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.plugins.fonts".to_string(),
            asset_name: String::new(),
            reason:
                "must be an object for native font plugin projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };
    let Some(faces_value) = fonts_object.get("faces") else {
        return;
    };
    let Some(faces) = faces_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.plugins.fonts.faces".to_string(),
            asset_name: String::new(),
            reason: "must be an array for native font face projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    for (face_index, face) in faces.iter().enumerate() {
        let previous_error_count = errors.len();
        validate_font_face(face_index, face, errors);
        if errors.len() > previous_error_count {
            return;
        }
    }
}

fn validate_font_face(
    face_index: usize,
    face: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(face_object) = face.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("view.plugins.fonts.faces[{face_index}]"),
            asset_name: String::new(),
            reason:
                "must be an object for native font face projections in resolved projection JSON"
                    .to_string(),
        });
        return;
    };

    for field in ["family", "assetName", "assetType"] {
        if missing_or_null(face_object.get(field)) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.plugins.fonts.faces[{face_index}].{field}"),
                asset_name: String::new(),
                reason:
                    "must be explicitly provided for native font face projections in resolved projection JSON"
                        .to_string(),
            });
            return;
        }
    }
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
