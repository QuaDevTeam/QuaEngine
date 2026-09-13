use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewLayoutOrientation {
    Landscape,
    Portrait,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewLayoutScaleMode {
    Fit,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewLayoutProjection {
    pub orientation: ViewLayoutOrientation,
    pub width: f64,
    pub height: f64,
    pub aspect_ratio: f64,
    pub min_aspect_ratio: f64,
    pub max_aspect_ratio: f64,
    pub scale_mode: ViewLayoutScaleMode,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewLayoutInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<ViewLayoutOrientation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orientation: Option<ViewLayoutOrientation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_aspect_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_aspect_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale_mode: Option<ViewLayoutScaleMode>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageContainerSize {
    pub width: f64,
    pub height: f64,
    pub device_pixel_ratio: f64,
    pub safe_area_insets: StageSafeAreaInsets,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageContainerInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_pixel_ratio: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safe_area_insets: Option<StageSafeAreaInsets>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSafeArea {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSafeAreaInsets {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageClientPoint {
    pub client_x: f64,
    pub client_y: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageLogicalPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageClientRectOrigin {
    pub left: f64,
    pub top: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageHitTestPoint {
    pub x: f64,
    pub y: f64,
    pub inside_viewport: bool,
    pub inside_stage: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedStageLayout {
    pub layout: ViewLayoutProjection,
    pub container_width: f64,
    pub container_height: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale: f64,
    pub physical_scale: f64,
    pub aspect_ratio: f64,
    pub device_pixel_ratio: f64,
    pub physical_viewport_width: f64,
    pub physical_viewport_height: f64,
    pub aspect_safe_area: StageSafeArea,
    pub device_safe_area: StageSafeArea,
    pub css_safe_area_insets: StageSafeAreaInsets,
    pub logical_safe_area_insets: StageSafeAreaInsets,
    pub safe_area: StageSafeArea,
}
