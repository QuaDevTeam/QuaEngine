use super::super::{provenance, rect, test_layout};
use crate::input::{native_renderer_intent_from_hit, resolve_renderer_intent_at};
use crate::projection::common::{FontFamilyProjection, FontWeightProjection};
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceBackgroundPositionProjection,
    UiSurfaceBorderStyleProjection, UiSurfaceEdgeInsetsProjection, UiSurfaceFontStyleProjection,
    UiSurfaceGradientKindProjection, UiSurfaceGradientProjection, UiSurfaceImageProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceObjectFitProjection,
    UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection, UiSurfaceTextDecorationProjection,
    UiSurfaceTextOverflowProjection, UiSurfaceTextTransformProjection,
    UiSurfaceWhiteSpaceProjection,
};
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, FontStyleDrawParam, FontWeightDrawParam, GradientDrawKind,
    LogicalRect, MediaFit, RenderGraph, RenderPlane, TextAlign, TextDecorationDrawParam,
    TextOverflowDrawParam, TextTransformDrawParam, WhiteSpaceDrawParam,
};
use crate::resources::ResourceId;

mod commands;
mod graph_intents;
mod style;
