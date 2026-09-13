use super::super::{rect, test_layout};
use crate::input::resolve_renderer_intent_at;
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceBackgroundPositionProjection,
    UiSurfaceImageProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection,
    UiSurfaceObjectFitProjection, UiSurfaceResolvedStyle,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, LogicalRect, MediaFit, RenderGraph};
use crate::resources::ResourceId;

mod clip_children;
mod safe_area;
mod scroll;
