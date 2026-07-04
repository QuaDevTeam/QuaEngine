use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderPlane};

use super::super::super::types::{UiOverlayProjection, UiSurfaceNodeProjection};
use super::super::helpers::apply_provenance;

pub(in crate::projection::ui::surface) fn scroll_clip_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_index: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    kind: DrawCommandKind,
    bounds: LogicalRect,
) -> DrawCommand {
    let command = DrawCommand::new(command_id, RenderPlane::Screen, kind, bounds)
        .z_index(z_index)
        .clip_bounds(clip_bounds.iter().copied());

    let command = apply_provenance(command, &overlay.provenance);
    apply_provenance(command, &node.provenance)
}
