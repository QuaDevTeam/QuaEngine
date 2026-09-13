use super::*;

use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::DrawCommandParams;
use crate::renderer::backend::{
    NativeBackendDrawPlan, NativeRenderFrameRef, NativeRenderSubmission,
};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

mod clip;
mod lowering;
mod metadata;
mod resources;
mod support;
