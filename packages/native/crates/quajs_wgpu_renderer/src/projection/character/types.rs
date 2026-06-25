use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::{default_one_f32, default_true};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterProjection {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sprite: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    #[serde(default)]
    pub position: CharacterPosition,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default)]
    pub layer: i32,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl CharacterProjection {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            visible: true,
            sprite: None,
            expression: None,
            position: CharacterPosition::default(),
            opacity: 1.0,
            layer: 0,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPosition {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x_percent: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y_percent: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}
