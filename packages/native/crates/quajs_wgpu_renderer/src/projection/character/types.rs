use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::{default_one_f32, default_true, is_one_f32};

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sprite_layers: Vec<CharacterSpriteLayerProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sprite_base: Option<CharacterSpriteLayerProjection>,
    #[serde(default)]
    pub position: CharacterPosition,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    /// Renderer-local enter/exit presence opacity. Injected by
    /// `NativeRendererProjectionRuntime`; absent from engine frames so the
    /// default of 1.0 is correct.
    #[serde(default = "default_one_f32", skip_serializing_if = "is_one_f32")]
    pub presence_opacity: f32,
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
            sprite_layers: Vec::new(),
            sprite_base: None,
            position: CharacterPosition::default(),
            opacity: 1.0,
            presence_opacity: 1.0,
            layer: 0,
            provenance: PackageProvenance::default(),
        }
    }
}

impl Default for CharacterProjection {
    fn default() -> Self {
        Self::new("", "")
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSpriteLayerProjection {
    pub asset: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<CharacterSpriteFrame>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default = "default_one_f32")]
    pub scale: f32,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "default_true")]
    pub visible: bool,
}

impl Default for CharacterSpriteLayerProjection {
    fn default() -> Self {
        Self {
            asset: String::new(),
            frame: None,
            mask: None,
            blend_mode: None,
            anchor: None,
            offset_x: 0.0,
            offset_y: 0.0,
            z_index: 0,
            opacity: 1.0,
            scale: 1.0,
            rotation: 0.0,
            visible: true,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct CharacterSpriteFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
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
