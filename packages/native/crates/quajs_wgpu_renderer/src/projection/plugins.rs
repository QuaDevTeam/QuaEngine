use serde::{Deserialize, Serialize};

use super::fonts::FontsProjection;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fonts: Option<FontsProjection>,
}

impl PluginProjection {
    pub fn fonts(fonts: FontsProjection) -> Self {
        Self { fonts: Some(fonts) }
    }
}
