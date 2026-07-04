mod background;
mod clip;
mod nodes;

use crate::render_graph::{DrawCommand, LogicalRect};

use super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
use super::helpers::{apply_provenance, node_rect, renderer_intent, SurfaceNodeOffset};
use nodes::{
    button_node_command, image_node_command, surface_panel_node_command, text_node_command,
};

pub(super) use background::surface_background_image_command;
pub(super) use clip::scroll_clip_command;

pub(super) fn surface_node_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) -> Option<DrawCommand> {
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    let mut command = match node.kind {
        UiSurfaceNodeKind::Box => {
            surface_panel_node_command(node, command_id, bounds, "ui-box", "rgba(0,0,0,0.0)", None)
        }
        UiSurfaceNodeKind::Backdrop => {
            let intent = node
                .intent
                .as_ref()
                .map(|intent| renderer_intent(overlay, node, intent));
            surface_panel_node_command(
                node,
                command_id,
                bounds,
                "ui-backdrop",
                "rgba(0,0,0,0.56)",
                intent,
            )
        }
        UiSurfaceNodeKind::Button => button_node_command(overlay, node, command_id, bounds),
        UiSurfaceNodeKind::Divider => surface_panel_node_command(
            node,
            command_id,
            bounds,
            "ui-divider",
            "rgba(255,255,255,0.18)",
            None,
        ),
        UiSurfaceNodeKind::Column
        | UiSurfaceNodeKind::Fragment
        | UiSurfaceNodeKind::Grid
        | UiSurfaceNodeKind::Row
        | UiSurfaceNodeKind::Stack => {
            unreachable!("structural group nodes are expanded before command build")
        }
        UiSurfaceNodeKind::Layer => {
            unreachable!("layer nodes are expanded before command build")
        }
        UiSurfaceNodeKind::SafeArea => {
            unreachable!("safe-area nodes are expanded before command build")
        }
        UiSurfaceNodeKind::Spacer => {
            unreachable!("spacer nodes are skipped before command build")
        }
        UiSurfaceNodeKind::Text => text_node_command(
            node,
            command_id,
            bounds,
            crate::render_graph::DrawCommandKind::Text,
            "ui-text",
        ),
        UiSurfaceNodeKind::RichText => text_node_command(
            node,
            command_id,
            bounds,
            crate::render_graph::DrawCommandKind::RichText,
            "ui-rich-text",
        ),
        UiSurfaceNodeKind::Image => image_node_command(node, command_id, bounds)?,
        UiSurfaceNodeKind::Panel => {
            let intent = node
                .intent
                .as_ref()
                .map(|intent| renderer_intent(overlay, node, intent));
            surface_panel_node_command(
                node,
                command_id,
                bounds,
                "ui-panel",
                "rgba(0,0,0,0.0)",
                intent,
            )
        }
        UiSurfaceNodeKind::Scroll => unreachable!("scroll nodes are expanded before command build"),
    };

    command = command
        .z_index(z_base.saturating_add(node.z_index))
        .opacity(effective_opacity)
        .clip_bounds(clip_bounds.iter().copied());
    command = apply_provenance(command, &overlay.provenance);
    Some(apply_provenance(command, &node.provenance))
}

pub(super) fn surface_scroll_panel_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
    effective_opacity: f32,
) -> DrawCommand {
    let command = surface_panel_node_command(
        node,
        command_id.to_string(),
        bounds,
        "ui-scroll",
        "rgba(0,0,0,0.0)",
        None,
    )
    .z_index(z_base.saturating_add(node.z_index))
    .opacity(effective_opacity)
    .clip_bounds(clip_bounds.iter().copied());

    let command = apply_provenance(command, &overlay.provenance);
    apply_provenance(command, &node.provenance)
}
