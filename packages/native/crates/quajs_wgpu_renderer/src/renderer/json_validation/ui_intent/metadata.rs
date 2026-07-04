mod budget;
mod value;

use std::collections::BTreeMap;

use serde_json::Value;

use super::super::safe_strings::invalid_native_json_ui_dispatch_identifier_reason;
use budget::{MetadataBudget, MAX_NATIVE_UI_INTENT_METADATA_ENTRIES};
use value::validate_metadata_value;

pub(super) fn invalid_native_json_ui_intent_metadata_reason(
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

fn metadata_child_path(parent: &str, key: &str) -> String {
    format!("{parent}.{key}")
}

#[cfg(test)]
mod tests {
    use super::budget::MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES;
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
        for _ in 0..budget::MAX_NATIVE_UI_INTENT_METADATA_DEPTH {
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
