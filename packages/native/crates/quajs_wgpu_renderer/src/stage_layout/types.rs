#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewLayoutOrientation {
    Landscape,
    Portrait,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewLayoutScaleMode {
    Fit,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ViewLayoutProjection {
    pub orientation: ViewLayoutOrientation,
    pub width: f64,
    pub height: f64,
    pub aspect_ratio: f64,
    pub min_aspect_ratio: f64,
    pub max_aspect_ratio: f64,
    pub scale_mode: ViewLayoutScaleMode,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ViewLayoutInput {
    pub preset: Option<ViewLayoutOrientation>,
    pub orientation: Option<ViewLayoutOrientation>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub aspect_ratio: Option<f64>,
    pub min_aspect_ratio: Option<f64>,
    pub max_aspect_ratio: Option<f64>,
    pub scale_mode: Option<ViewLayoutScaleMode>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StageContainerSize {
    pub width: f64,
    pub height: f64,
    pub device_pixel_ratio: f64,
    pub safe_area_insets: StageSafeAreaInsets,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageContainerInput {
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub device_pixel_ratio: Option<f64>,
    pub safe_area_insets: Option<StageSafeAreaInsets>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageSafeArea {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageSafeAreaInsets {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageClientPoint {
    pub client_x: f64,
    pub client_y: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageLogicalPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageClientRectOrigin {
    pub left: f64,
    pub top: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StageHitTestPoint {
    pub x: f64,
    pub y: f64,
    pub inside_viewport: bool,
    pub inside_stage: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
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
