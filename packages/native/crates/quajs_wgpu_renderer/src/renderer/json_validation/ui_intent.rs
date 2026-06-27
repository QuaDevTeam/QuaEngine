use std::collections::BTreeMap;

use serde_json::Value;

use crate::projection::ui::UiIntentProjection;
use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::safe_strings::invalid_native_json_ui_dispatch_identifier_reason;

const MAX_NATIVE_UI_INTENT_METADATA_ENTRIES: usize = 32;
const MAX_NATIVE_UI_INTENT_METADATA_TOTAL_BYTES: usize = 16 * 1024;
const MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES: usize = 4 * 1024;
const MAX_NATIVE_UI_INTENT_METADATA_DEPTH: usize = 8;
const MAX_NATIVE_UI_INTENT_METADATA_ARRAY_ITEMS: usize = 128;
const MAX_NATIVE_UI_INTENT_METADATA_OBJECT_FIELDS: usize = 64;

pub(super) fn validate_native_json_ui_intent_projection(
    path: &str,
    intent: &UiIntentProjection,
) -> Vec<NativeRendererJsonValidationError> {
    let mut errors = Vec::new();

    if let Some(reason) = invalid_native_json_ui_intent_event_reason(&intent.event) {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.event"),
            asset_name: intent.event.clone(),
            reason,
        });
        return errors;
    }

    if let Some(action) = &intent.action {
        if let Some(reason) =
            invalid_native_json_ui_dispatch_identifier_reason(action, "UI intent actions")
        {
            errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.action"),
                asset_name: action.to_string(),
                reason,
            });
        }
    }

    if let Some((field, value, reason)) =
        invalid_native_json_ui_intent_metadata_reason(&intent.metadata)
    {
        errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.{field}"),
            asset_name: value,
            reason,
        });
    }

    if intent.event != "choice/select" {
        if let Some(choice_id) = &intent.choice_id {
            if let Some(reason) =
                invalid_native_json_ui_dispatch_identifier_reason(choice_id, "choice ids")
            {
                errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}.choiceId"),
                    asset_name: choice_id.to_string(),
                    reason,
                });
            }
        }
        return errors;
    }

    match intent.choice_id.as_deref() {
        Some(choice_id) if !choice_id.trim().is_empty() => {
            if let Some(reason) =
                invalid_native_json_ui_dispatch_identifier_reason(choice_id, "choice ids")
            {
                errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}.choiceId"),
                    asset_name: choice_id.to_string(),
                    reason,
                });
            }
        }
        _ => errors.push(NativeRendererJsonValidationError {
            path: format!("{path}.choiceId"),
            asset_name: intent.choice_id.clone().unwrap_or_default(),
            reason: "choice/select intents must declare canonical choiceId".to_string(),
        }),
    }

    errors
}

fn invalid_native_json_ui_intent_event_reason(event: &str) -> Option<String> {
    match event {
        "ui/intent" | "choice/select" => None,
        _ => Some("UI surface intent events must be ui/intent or choice/select".to_string()),
    }
}

fn invalid_native_json_ui_intent_metadata_reason(
    metadata: &BTreeMap<String, Value>,
) -> Option<(String, String, String)> {
    if metadata.len() > MAX_NATIVE_UI_INTENT_METADATA_ENTRIES {
        return Some((
            "metadata".to_string(),
            metadata.len().to_string(),
            "UI intent metadata must stay within native renderer payload limits".to_string(),
        ));
    }

    let mut budget = MetadataBudget::default();
    if let Some(error) = budget.add_bytes("metadata", 2) {
        return Some(error);
    }
    for (key, value) in metadata {
        if let Some(reason) =
            invalid_native_json_ui_dispatch_identifier_reason(key, "UI intent metadata keys")
        {
            return Some((
                metadata_child_path("metadata", key),
                key.to_string(),
                reason,
            ));
        }
        let path = metadata_child_path("metadata", key);
        if let Some(error) = budget.add_bytes(&path, key.len() + 4) {
            return Some(error);
        }
        if let Some(error) = validate_metadata_value(value, &path, 1, &mut budget) {
            return Some(error);
        }
    }

    None
}

#[derive(Default)]
struct MetadataBudget {
    total_bytes: usize,
}

impl MetadataBudget {
    fn add_bytes(&mut self, path: &str, bytes: usize) -> Option<(String, String, String)> {
        self.total_bytes = self.total_bytes.saturating_add(bytes);
        if self.total_bytes > MAX_NATIVE_UI_INTENT_METADATA_TOTAL_BYTES {
            return Some((
                path.to_string(),
                self.total_bytes.to_string(),
                "UI intent metadata must stay within native renderer payload limits".to_string(),
            ));
        }
        None
    }
}

fn validate_metadata_value(
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
        Value::String(value) => {
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
        Value::Array(values) => {
            if values.len() > MAX_NATIVE_UI_INTENT_METADATA_ARRAY_ITEMS {
                return Some((
                    path.to_string(),
                    values.len().to_string(),
                    "UI intent metadata arrays must stay within native renderer payload limits"
                        .to_string(),
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
        Value::Object(values) => {
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
                if let Some(reason) = invalid_native_json_ui_dispatch_identifier_reason(
                    key,
                    "UI intent metadata keys",
                ) {
                    return Some((metadata_child_path(path, key), key.to_string(), reason));
                }
                let child_path = metadata_child_path(path, key);
                if let Some(error) = budget.add_bytes(&child_path, key.len() + 4) {
                    return Some(error);
                }
                if let Some(error) = validate_metadata_value(value, &child_path, depth + 1, budget)
                {
                    return Some(error);
                }
            }
            None
        }
    }
}

fn metadata_child_path(parent: &str, key: &str) -> String {
    format!("{parent}.{key}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_small_metadata_payloads() {
        let mut metadata = BTreeMap::new();
        metadata.insert("source".to_string(), Value::String("menu".to_string()));
        metadata.insert("index".to_string(), Value::Number(1.into()));

        assert_eq!(
            invalid_native_json_ui_intent_metadata_reason(&metadata),
            None
        );
    }

    #[test]
    fn rejects_oversized_metadata_strings() {
        let mut metadata = BTreeMap::new();
        metadata.insert(
            "arg0".to_string(),
            Value::String("x".repeat(MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES + 1)),
        );

        let error = invalid_native_json_ui_intent_metadata_reason(&metadata).unwrap();
        assert_eq!(error.0, "metadata.arg0");
        assert_eq!(
            error.1,
            (MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES + 1).to_string()
        );
        assert!(error.2.contains("strings"));
    }

    #[test]
    fn rejects_nested_unsafe_metadata_keys() {
        let mut nested = serde_json::Map::new();
        nested.insert("native/load.dll".to_string(), Value::Bool(true));
        let mut metadata = BTreeMap::new();
        metadata.insert("args".to_string(), Value::Object(nested));

        let error = invalid_native_json_ui_intent_metadata_reason(&metadata).unwrap();
        assert_eq!(error.0, "metadata.args.native/load.dll");
        assert_eq!(error.1, "native/load.dll");
        assert!(error.2.contains("paths"));
    }

    #[test]
    fn rejects_deep_metadata_payloads() {
        let mut value = Value::String("leaf".to_string());
        for _ in 0..MAX_NATIVE_UI_INTENT_METADATA_DEPTH {
            let mut object = serde_json::Map::new();
            object.insert("child".to_string(), value);
            value = Value::Object(object);
        }
        let mut metadata = BTreeMap::new();
        metadata.insert("root".to_string(), value);

        let error = invalid_native_json_ui_intent_metadata_reason(&metadata).unwrap();
        assert!(error.0.ends_with(".child"));
        assert!(error.2.contains("nesting"));
    }
}
