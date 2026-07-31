use std::collections::{BTreeMap, BTreeSet};

use crate::resources::ResourceId;
use crate::stage_layout::StageSafeArea;

use super::style::{DrawCommandParams, DrawTransition, UiControlDrawParam};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RenderPlane {
    Scene,
    Subject,
    Stage,
    Safe,
    Overlay,
    Screen,
}

impl RenderPlane {
    pub const ORDERED: [RenderPlane; 6] = [
        RenderPlane::Scene,
        RenderPlane::Subject,
        RenderPlane::Stage,
        RenderPlane::Safe,
        RenderPlane::Overlay,
        RenderPlane::Screen,
    ];

    pub fn z_base(self) -> i32 {
        match self {
            RenderPlane::Scene => 0,
            RenderPlane::Subject => 1_000,
            RenderPlane::Stage => 2_000,
            RenderPlane::Safe => 3_000,
            RenderPlane::Overlay => 4_000,
            RenderPlane::Screen => 5_000,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DrawCommandKind {
    Clear,
    Image,
    NineSlice,
    Text,
    RichText,
    Rect,
    RoundedRect,
    ClipStart,
    ClipEnd,
    VideoFrame,
    UiSurface,
    BackdropBlur,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DrawInteractionState {
    Active,
    Focus,
    FocusVisible,
    Hover,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LogicalRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DrawCommandVariant {
    pub bounds: LogicalRect,
    pub clip_bounds: Vec<LogicalRect>,
    pub kind: DrawCommandKind,
    pub opacity: f32,
    pub params: DrawCommandParams,
    pub resource_ids: Vec<ResourceId>,
    pub z_index: i32,
}

impl DrawCommandVariant {
    pub fn from_command(command: &DrawCommand) -> Self {
        Self {
            bounds: command.bounds,
            clip_bounds: command.clip_bounds.clone(),
            kind: command.kind,
            opacity: command.opacity,
            params: command.params.clone(),
            resource_ids: command.resource_ids.clone(),
            z_index: command.z_index,
        }
    }

    pub fn hidden_from_command(command: &DrawCommand) -> Self {
        let mut variant = Self::from_command(command);
        variant.opacity = 0.0;
        variant
    }
}

impl LogicalRect {
    pub fn from_safe_area(safe_area: StageSafeArea) -> Self {
        Self {
            x: safe_area.x,
            y: safe_area.y,
            width: safe_area.width,
            height: safe_area.height,
        }
    }

    pub fn is_empty(self) -> bool {
        self.width <= 0.0 || self.height <= 0.0
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DrawCommand {
    pub id: String,
    pub plane: RenderPlane,
    pub z_index: i32,
    pub kind: DrawCommandKind,
    pub bounds: LogicalRect,
    pub opacity: f32,
    pub resource_ids: Vec<ResourceId>,
    pub clip_bounds: Vec<LogicalRect>,
    pub params: DrawCommandParams,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub interactive: bool,
    pub control: Option<UiControlDrawParam>,
    pub label: Option<String>,
    pub interaction_group_id: Option<String>,
    pub interaction_variants: BTreeMap<DrawInteractionState, DrawCommandVariant>,
    pub interaction_transitions: Vec<DrawTransition>,
}

impl DrawCommand {
    pub fn new(
        id: impl Into<String>,
        plane: RenderPlane,
        kind: DrawCommandKind,
        bounds: LogicalRect,
    ) -> Self {
        Self {
            id: id.into(),
            plane,
            z_index: 0,
            kind,
            bounds,
            opacity: 1.0,
            resource_ids: Vec::new(),
            clip_bounds: Vec::new(),
            params: DrawCommandParams::None,
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            interactive: false,
            control: None,
            label: None,
            interaction_group_id: None,
            interaction_variants: BTreeMap::new(),
            interaction_transitions: Vec::new(),
        }
    }

    pub fn z_index(mut self, z_index: i32) -> Self {
        self.z_index = z_index;
        self
    }

    pub fn opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity.clamp(0.0, 1.0);
        self
    }

    pub fn resource(mut self, resource_id: impl Into<ResourceId>) -> Self {
        self.resource_ids.push(resource_id.into());
        self
    }

    pub fn resources<I, R>(mut self, resource_ids: I) -> Self
    where
        I: IntoIterator<Item = R>,
        R: Into<ResourceId>,
    {
        self.resource_ids
            .extend(resource_ids.into_iter().map(Into::into));
        self
    }

    pub fn control(mut self, control: UiControlDrawParam) -> Self {
        self.control = Some(control);
        self
    }

    pub fn clip_bounds<I>(mut self, clip_bounds: I) -> Self
    where
        I: IntoIterator<Item = LogicalRect>,
    {
        self.clip_bounds.extend(clip_bounds);
        self
    }

    pub fn params(mut self, params: DrawCommandParams) -> Self {
        self.params = params;
        self
    }

    pub fn owned_by(mut self, package_id: impl Into<String>) -> Self {
        self.owner_package_id = Some(package_id.into());
        self
    }

    pub fn require_package(mut self, package_id: impl Into<String>) -> Self {
        self.required_package_ids.insert(package_id.into());
        self
    }

    pub fn require_packages<I, S>(mut self, package_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for package_id in package_ids {
            self.required_package_ids.insert(package_id.into());
        }
        self
    }

    pub fn interactive(mut self, interactive: bool) -> Self {
        self.interactive = interactive;
        self
    }

    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }

    pub fn interaction_group(mut self, group_id: impl Into<String>) -> Self {
        self.interaction_group_id = Some(group_id.into());
        self
    }

    pub fn interaction_variant(
        mut self,
        state: DrawInteractionState,
        variant: DrawCommandVariant,
    ) -> Self {
        self.interaction_variants.insert(state, variant);
        self
    }

    pub fn interaction_transitions<I>(mut self, transitions: I) -> Self
    where
        I: IntoIterator<Item = DrawTransition>,
    {
        self.interaction_transitions.extend(transitions);
        self
    }
}
