use serde_json::Value;

use super::super::super::safe_strings::invalid_native_json_ui_dispatch_identifier_reason;
use super::budget::{
    MetadataBudget, MAX_NATIVE_UI_INTENT_METADATA_ARRAY_ITEMS, MAX_NATIVE_UI_INTENT_METADATA_DEPTH,
    MAX_NATIVE_UI_INTENT_METADATA_OBJECT_FIELDS, MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES,
};
use super::metadata_child_path;

pub(super) fn validate_metadata_value(
    value: &Value,
    path: &str,
    depth: usize,
    budget: &mut MetadataBudget,
) -> Option<(String, String, String)> {
    if depth > MAX_NATIVE_UI_INTENT_METADATA_DEPTH {
        return Some((
            path.to_string(),
            depth.to_string(),
            "UI intent metadata nesting must stay within native renderer payload limits"
                .to_string(),
        ));
    }

    match value {
        Value::Null => budget.add_bytes(path, 4),
        Value::Bool(value) => budget.add_bytes(path, if *value { 4 } else { 5 }),
        Value::Number(value) => budget.add_bytes(path, value.to_string().len()),
        Value::String(value) => validate_metadata_string(value, path, budget),
        Value::Array(values) => validate_metadata_array(values, path, depth, budget),
        Value::Object(values) => validate_metadata_object(values, path, depth, budget),
    }
}

fn validate_metadata_string(
    value: &str,
    path: &str,
    budget: &mut MetadataBudget,
) -> Option<(String, String, String)> {
    if value.len() > MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES {
        return Some((
            path.to_string(),
            value.len().to_string(),
            "UI intent metadata strings must stay within native renderer payload limits"
                .to_string(),
        ));
    }
    budget.add_bytes(path, value.len() + 2)
}

fn validate_metadata_array(
    values: &[Value],
    path: &str,
    depth: usize,
    budget: &mut MetadataBudget,
) -> Option<(String, String, String)> {
    if values.len() > MAX_NATIVE_UI_INTENT_METADATA_ARRAY_ITEMS {
        return Some((
            path.to_string(),
            values.len().to_string(),
            "UI intent metadata arrays must stay within native renderer payload limits".to_string(),
        ));
    }
    if let Some(error) = budget.add_bytes(path, 2) {
        return Some(error);
    }
    for (index, value) in values.iter().enumerate() {
        if let Some(error) =
            validate_metadata_value(value, &format!("{path}[{index}]"), depth + 1, budget)
        {
            return Some(error);
        }
    }
    None
}

fn validate_metadata_object(
    values: &serde_json::Map<String, Value>,
    path: &str,
    depth: usize,
    budget: &mut MetadataBudget,
) -> Option<(String, String, String)> {
    if values.len() > MAX_NATIVE_UI_INTENT_METADATA_OBJECT_FIELDS {
        return Some((
            path.to_string(),
            values.len().to_string(),
            "UI intent metadata objects must stay within native renderer payload limits"
                .to_string(),
        ));
    }
    if let Some(error) = budget.add_bytes(path, 2) {
        return Some(error);
    }
    for (key, value) in values {
        if let Some(reason) =
            invalid_native_json_ui_dispatch_identifier_reason(key, "UI intent metadata keys")
        {
            return Some((metadata_child_path(path, key), key.to_string(), reason));
        }
        let child_path = metadata_child_path(path, key);
        if let Some(error) = budget.add_bytes(&child_path, key.len() + 4) {
            return Some(error);
        }
        if let Some(error) = validate_metadata_value(value, &child_path, depth + 1, budget) {
            return Some(error);
        }
    }
    None
}
