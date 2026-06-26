use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};
use crate::projection::defaults::{default_one_f32, default_true};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiProjection {
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overlays: Vec<UiOverlayProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl Default for UiProjection {
    fn default() -> Self {
        Self {
            visible: true,
            overlays: Vec::new(),
            provenance: PackageProvenance::default(),
        }
    }
}

impl UiProjection {
    pub fn new(overlays: Vec<UiOverlayProjection>) -> Self {
        Self {
            overlays,
            ..Default::default()
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiOverlayRenderMode {
    #[default]
    Ui,
    RenderOnly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiOverlayProjection {
    pub element_id: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub render_mode: UiOverlayRenderMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interactive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay_stack: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack_priority: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface: Option<UiOverlaySurfaceProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<UiOverlaySceneProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<UiIntentProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl UiOverlayProjection {
    pub fn new(element_id: impl Into<String>) -> Self {
        Self {
            element_id: element_id.into(),
            visible: true,
            render_mode: UiOverlayRenderMode::Ui,
            interactive: None,
            overlay_stack: None,
            stack_priority: None,
            z_index: None,
            surface: None,
            scene: None,
            intent: None,
            provenance: PackageProvenance::default(),
        }
    }

    pub fn with_surface(mut self, key: impl Into<String>) -> Self {
        self.surface = Some(UiOverlaySurfaceProjection::new(key));
        self
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiOverlaySurfaceProjection {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root: Option<UiSurfaceNodeProjection>,
}

impl UiOverlaySurfaceProjection {
    pub fn new(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            root: None,
        }
    }

    pub fn with_root(mut self, root: UiSurfaceNodeProjection) -> Self {
        self.root = Some(root);
        self
    }
}

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

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTextAlignProjection {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceObjectFitProjection {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceBackgroundPositionProjection {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceEdgeInsetsProjection {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceResolvedStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_image: Option<UiSurfaceImageProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_position: Option<UiSurfaceBackgroundPositionProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_size: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<FontFamilyProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeightProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<UiSurfaceTextAlignProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_fit: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<UiSurfaceEdgeInsetsProjection>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceNodeProjection {
    pub id: String,
    #[serde(default)]
    pub kind: UiSurfaceNodeKind,
    #[serde(default = "default_true")]
    pub visible: bool,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiOverlaySceneProjection {
    pub id: String,
    #[serde(default)]
    pub render_mode: UiOverlayRenderMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interactive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface: Option<UiOverlaySurfaceProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay: Option<UiOverlaySceneShellProjection>,
}

impl UiOverlaySceneProjection {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            render_mode: UiOverlayRenderMode::Ui,
            interactive: None,
            surface: None,
            overlay: None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiOverlaySceneShellProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay_stack: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack_priority: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiIntentProjection {
    #[serde(default = "default_ui_intent_event")]
    pub event: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, Value>,
}

impl UiIntentProjection {
    pub fn new(action: impl Into<String>) -> Self {
        Self {
            event: "ui/intent".to_string(),
            action: Some(action.into()),
            metadata: BTreeMap::new(),
        }
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }
}

fn default_image_asset_type() -> String {
    "images".to_string()
}

fn default_ui_intent_event() -> String {
    "ui/intent".to_string()
}

fn is_zero_f64(value: &f64) -> bool {
    *value == 0.0
}
