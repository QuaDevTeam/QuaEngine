use serde::{Deserialize, Serialize};

use crate::projection::common::PackageProvenance;
use crate::projection::defaults::{default_one_f32, default_true, is_one_f32};

use super::{UiIntentProjection, UiSurfaceNodeProjection};

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
    #[serde(flatten)]
    pub motion: crate::projection::motion::MotionProjection,
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
    /// Renderer-local enter/exit presence opacity, injected by
    /// `NativeRendererProjectionRuntime`; absent from engine projections.
    #[serde(default = "default_one_f32", skip_serializing_if = "is_one_f32")]
    pub presence_opacity: f32,
}

impl UiOverlayProjection {
    pub fn new(element_id: impl Into<String>) -> Self {
        Self {
            motion: Default::default(),
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
            presence_opacity: 1.0,
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
