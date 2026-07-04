use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::character::CharacterProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};
use crate::resources::plan_render_graph_resources;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

mod declarative_memory;
mod font_memory;
mod frame_resources;
mod support;
