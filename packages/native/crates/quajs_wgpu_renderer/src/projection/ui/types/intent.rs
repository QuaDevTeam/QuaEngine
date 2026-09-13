use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::default_ui_intent_event;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiIntentProjection {
    #[serde(default = "default_ui_intent_event")]
    pub event: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choice_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, Value>,
}

impl UiIntentProjection {
    pub fn new(action: impl Into<String>) -> Self {
        Self {
            event: "ui/intent".to_string(),
            choice_id: None,
            action: Some(action.into()),
            metadata: BTreeMap::new(),
        }
    }

    pub fn choice_select(choice_id: impl Into<String>) -> Self {
        Self {
            event: "choice/select".to_string(),
            choice_id: Some(choice_id.into()),
            action: Some("select".to_string()),
            metadata: BTreeMap::new(),
        }
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }
}
