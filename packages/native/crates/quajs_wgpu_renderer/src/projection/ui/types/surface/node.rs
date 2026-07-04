use serde::{Deserialize, Serialize};

use crate::projection::common::PackageProvenance;
use crate::projection::defaults::{default_one_f32, default_true};

use super::UiSurfaceResolvedStyle;
use crate::projection::ui::types::{
    default_image_asset_type, is_false, is_zero_f64, UiIntentProjection,
};

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum UiSurfaceNodeKind {
    #[default]
    Box,
    Backdrop,
    Button,
    Column,
    Divider,
    Fragment,
    Grid,
    Layer,
    Row,
    SafeArea,
    Spacer,
    Stack,
    Text,
    RichText,
    Image,
    Panel,
    Scroll,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceNodeRect {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceImageProjection {
    #[serde(default = "default_image_asset_type")]
    pub asset_type: String,
    pub asset_name: String,
}

impl UiSurfaceImageProjection {
    pub fn new(asset_name: impl Into<String>) -> Self {
        Self {
            asset_type: "images".to_string(),
            asset_name: asset_name.into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceNodeProjection {
    pub id: String,
    #[serde(default)]
    pub kind: UiSurfaceNodeKind,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub clip_children: bool,
    #[serde(default)]
    pub bounds: UiSurfaceNodeRect,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default = "default_one_f32")]
    pub opacity: f32,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub scroll_offset_x: f64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub scroll_offset_y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<UiSurfaceImageProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<UiIntentProjection>,
    #[serde(default)]
    pub style: UiSurfaceResolvedStyle,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<UiSurfaceNodeProjection>,
}

impl UiSurfaceNodeProjection {
    pub fn new(id: impl Into<String>, kind: UiSurfaceNodeKind, bounds: UiSurfaceNodeRect) -> Self {
        Self {
            id: id.into(),
            kind,
            visible: true,
            clip_children: false,
            bounds,
            z_index: 0,
            opacity: 1.0,
            scroll_offset_x: 0.0,
            scroll_offset_y: 0.0,
            text: None,
            image: None,
            intent: None,
            style: UiSurfaceResolvedStyle::default(),
            provenance: PackageProvenance::default(),
            children: Vec::new(),
        }
    }

    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    pub fn with_image(mut self, image: UiSurfaceImageProjection) -> Self {
        self.image = Some(image);
        self
    }

    pub fn with_intent(mut self, intent: UiIntentProjection) -> Self {
        self.intent = Some(intent);
        self
    }

    pub fn with_style(mut self, style: UiSurfaceResolvedStyle) -> Self {
        self.style = style;
        self
    }

    pub fn with_children(mut self, children: Vec<UiSurfaceNodeProjection>) -> Self {
        self.children = children;
        self
    }
}
