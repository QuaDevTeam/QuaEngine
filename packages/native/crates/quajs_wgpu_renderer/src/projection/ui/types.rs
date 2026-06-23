use crate::projection::common::PackageProvenance;

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiOverlaySurfaceProjection {
    pub key: String,
}

impl UiOverlaySurfaceProjection {
    pub fn new(key: impl Into<String>) -> Self {
        Self { key: key.into() }
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
