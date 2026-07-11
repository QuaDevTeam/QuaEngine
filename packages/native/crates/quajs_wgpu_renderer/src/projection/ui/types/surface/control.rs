use serde::{Deserialize, Serialize};

use super::super::UiIntentProjection;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceControlOptionProjection {
    pub label: String,
    pub intent: UiIntentProjection,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceRangeControlPartsProjection {
    pub progress: String,
    pub thumb: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb_halo: Option<String>,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceSelectControlPartsProjection {
    pub chevron: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceSwitchControlPartsProjection {
    pub track: String,
    pub thumb: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UiSurfaceControlProjection {
    Range {
        #[serde(default)]
        options: Vec<UiSurfaceControlOptionProjection>,
        parts: UiSurfaceRangeControlPartsProjection,
        selected_index: usize,
    },
    Select {
        #[serde(default)]
        options: Vec<UiSurfaceControlOptionProjection>,
        parts: UiSurfaceSelectControlPartsProjection,
        selected_index: usize,
    },
    Switch {
        #[serde(default)]
        options: Vec<UiSurfaceControlOptionProjection>,
        parts: UiSurfaceSwitchControlPartsProjection,
        selected_index: usize,
    },
}

impl UiSurfaceControlProjection {
    pub fn options(&self) -> &[UiSurfaceControlOptionProjection] {
        match self {
            Self::Range { options, .. }
            | Self::Select { options, .. }
            | Self::Switch { options, .. } => options,
        }
    }

    pub fn selected_index(&self) -> usize {
        match self {
            Self::Range { selected_index, .. }
            | Self::Select { selected_index, .. }
            | Self::Switch { selected_index, .. } => *selected_index,
        }
    }
}
