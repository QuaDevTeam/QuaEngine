use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};

#[derive(Clone, Debug, PartialEq)]
pub struct UiProjection {
    pub visible: bool,
    pub overlays: Vec<UiOverlayProjection>,
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum UiOverlayRenderMode {
    #[default]
    Ui,
    RenderOnly,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiOverlayProjection {
    pub element_id: String,
    pub visible: bool,
    pub render_mode: UiOverlayRenderMode,
    pub interactive: Option<bool>,
    pub overlay_stack: Option<String>,
    pub stack_priority: Option<i32>,
    pub z_index: Option<i32>,
    pub surface: Option<UiOverlaySurfaceProjection>,
    pub scene: Option<UiOverlaySceneProjection>,
    pub intent: Option<UiIntentProjection>,
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

#[derive(Clone, Debug, PartialEq)]
pub struct UiOverlaySurfaceProjection {
    pub key: String,
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
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

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiSurfaceNodeRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiSurfaceImageProjection {
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UiSurfaceTextAlignProjection {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UiSurfaceObjectFitProjection {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct UiSurfaceResolvedStyle {
    pub background_color: Option<String>,
    pub color: Option<String>,
    pub border_radius: Option<f64>,
    pub border_color: Option<String>,
    pub border_width: Option<f64>,
    pub font_family: Option<FontFamilyProjection>,
    pub font_size: Option<f64>,
    pub font_weight: Option<FontWeightProjection>,
    pub line_height: Option<f64>,
    pub text_align: Option<UiSurfaceTextAlignProjection>,
    pub object_fit: Option<UiSurfaceObjectFitProjection>,
    pub opacity: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiSurfaceNodeProjection {
    pub id: String,
    pub kind: UiSurfaceNodeKind,
    pub visible: bool,
    pub bounds: UiSurfaceNodeRect,
    pub z_index: i32,
    pub opacity: f32,
    pub text: Option<String>,
    pub image: Option<UiSurfaceImageProjection>,
    pub intent: Option<UiIntentProjection>,
    pub style: UiSurfaceResolvedStyle,
    pub provenance: PackageProvenance,
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

#[derive(Clone, Debug, PartialEq)]
pub struct UiOverlaySceneProjection {
    pub id: String,
    pub render_mode: UiOverlayRenderMode,
    pub interactive: Option<bool>,
    pub surface: Option<UiOverlaySurfaceProjection>,
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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct UiOverlaySceneShellProjection {
    pub overlay_stack: Option<String>,
    pub stack_priority: Option<i32>,
    pub z_index: Option<i32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiIntentProjection {
    pub event: String,
    pub action: Option<String>,
}

impl UiIntentProjection {
    pub fn new(action: impl Into<String>) -> Self {
        Self {
            event: "ui/intent".to_string(),
            action: Some(action.into()),
        }
    }
}
