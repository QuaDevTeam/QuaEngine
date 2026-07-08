use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::{default_one_f32, default_one_f64, default_true};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackgroundMode {
    Image,
    Video,
    Layered,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackgroundFit {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundProjection {
    pub mode: BackgroundMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_type: Option<String>,
    #[serde(default = "default_background_fit")]
    pub fit: BackgroundFit,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_one_f64")]
    pub scale: f64,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<BackgroundLayerProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video: Option<BackgroundVideoProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl Default for BackgroundProjection {
    fn default() -> Self {
        Self {
            mode: BackgroundMode::Image,
            asset_name: None,
            asset_type: None,
            fit: BackgroundFit::Cover,
            origin: None,
            width: None,
            height: None,
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            rotation: 0.0,
            opacity: 1.0,
            layers: Vec::new(),
            video: None,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundLayerProjection {
    pub id: String,
    pub asset_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_type: Option<String>,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default = "default_background_fit")]
    pub fit: BackgroundFit,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_one_f64")]
    pub scale: f64,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl BackgroundLayerProjection {
    pub fn new(id: impl Into<String>, asset_name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            asset_name: asset_name.into(),
            asset_type: None,
            visible: true,
            fit: BackgroundFit::Cover,
            origin: None,
            width: None,
            height: None,
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            rotation: 0.0,
            opacity: 1.0,
            z_index: 0,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundVideoProjection {
    pub asset_name: String,
    #[serde(default, rename = "loop", skip_serializing_if = "Option::is_none")]
    pub looped: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playback_rate: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seek_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poster: Option<String>,
    #[serde(default = "default_background_fit")]
    pub fit: BackgroundFit,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl BackgroundVideoProjection {
    pub fn new(asset_name: impl Into<String>) -> Self {
        Self {
            asset_name: asset_name.into(),
            looped: None,
            muted: None,
            volume: None,
            playback_rate: None,
            seek_ms: None,
            offset_ms: None,
            poster: None,
            fit: BackgroundFit::Cover,
            origin: None,
            opacity: 1.0,
            provenance: PackageProvenance::default(),
        }
    }
}

fn default_background_fit() -> BackgroundFit {
    BackgroundFit::Cover
}
