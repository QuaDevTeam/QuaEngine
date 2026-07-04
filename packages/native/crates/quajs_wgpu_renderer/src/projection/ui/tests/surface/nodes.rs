use super::super::{rect, test_layout};
use crate::input::resolve_renderer_intent_at;
use crate::projection::ui::{
    append_ui_commands, build_ui_commands, UiIntentProjection, UiOverlayProjection,
    UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderGraph};

mod opacity;
mod safety;
mod semantic;
mod structural;
