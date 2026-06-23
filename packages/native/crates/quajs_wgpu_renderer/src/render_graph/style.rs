use super::command::LogicalRect;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaFit {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaOrigin {
    pub x: f64,
    pub y: f64,
}

impl Default for MediaOrigin {
    fn default() -> Self {
        Self { x: 0.5, y: 0.5 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImageDrawParams {
    pub asset_type: String,
    pub asset_name: String,
    pub fit: MediaFit,
    pub origin: MediaOrigin,
    pub source: LogicalRect,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoDrawParams {
    pub asset_type: String,
    pub asset_name: String,
    pub poster_asset_name: Option<String>,
    pub fit: MediaFit,
    pub origin: MediaOrigin,
    pub source: LogicalRect,
    pub fallback_reason: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub enum DrawCommandParams {
    Image(ImageDrawParams),
    Video(VideoDrawParams),
    #[default]
    None,
}
