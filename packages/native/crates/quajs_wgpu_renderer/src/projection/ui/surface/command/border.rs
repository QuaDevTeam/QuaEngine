use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    LogicalRect, PanelDrawParams, RenderPlane,
};

use super::super::super::style::resolve_border_edges;
use super::super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
use super::super::helpers::apply_provenance;

const SIDE_NAMES: [&str; 4] = ["top", "right", "bottom", "left"];

/// Per-side border edge commands (CSS `border-<side>-width/color`). Each side
/// with a positive width and a resolvable color becomes one thin panel command
/// inset from the node's border box, painted above the node fill. Per-side
/// radii are intentionally ignored: edge strips stay square like the Web
/// renderer's hairline borders.
pub(in crate::projection::ui::surface) fn surface_border_edge_commands(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
    effective_opacity: f32,
) -> Vec<DrawCommand> {
    if let Some(border) = &node.style.border_image {
        let mut image_node = node.clone();
        image_node.style.background_image = Some(border.source.clone());
        let Some(mut command) = super::background::surface_background_image_command(
            overlay,
            &image_node,
            z_base,
            clip_bounds,
            command_id,
            bounds,
            effective_opacity,
        ) else {
            return Vec::new();
        };
        command.id = format!("{command_id}:border-image");
        command.kind = DrawCommandKind::NineSlice;
        if let DrawCommandParams::Image(params) = &mut command.params {
            let edges = |value: &crate::projection::ui::UiSurfaceEdgeInsetsProjection| {
                [value.top, value.right, value.bottom, value.left]
            };
            params.fit = crate::render_graph::MediaFit::Fill;
            params.sampling.nine_slice = Some(crate::render_graph::NineSliceDrawParams {
                slice: edges(&border.slice),
                width: edges(border.width.as_ref().unwrap_or(&border.slice)),
                repeat: border.repeat.as_deref() == Some("repeat"),
                fill: border.fill,
            });
        }
        return vec![command];
    }
    if !matches!(
        node.kind,
        UiSurfaceNodeKind::Backdrop
            | UiSurfaceNodeKind::Box
            | UiSurfaceNodeKind::Button
            | UiSurfaceNodeKind::Panel
            | UiSurfaceNodeKind::Scroll
    ) {
        return Vec::new();
    }
    let Some(edges) = resolve_border_edges(&node.style) else {
        return Vec::new();
    };

    let side_rects = [
        LogicalRect {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: edges.widths[0],
        },
        LogicalRect {
            x: bounds.x + bounds.width - edges.widths[1],
            y: bounds.y,
            width: edges.widths[1],
            height: bounds.height,
        },
        LogicalRect {
            x: bounds.x,
            y: bounds.y + bounds.height - edges.widths[2],
            width: bounds.width,
            height: edges.widths[2],
        },
        LogicalRect {
            x: bounds.x,
            y: bounds.y,
            width: edges.widths[3],
            height: bounds.height,
        },
    ];

    SIDE_NAMES
        .iter()
        .zip(side_rects.iter())
        .enumerate()
        .filter_map(|(index, (side, rect))| {
            let color = edges.colors[index].as_ref()?;
            if rect.is_empty() {
                return None;
            }
            let command = DrawCommand::new(
                format!("{command_id}:border-{side}"),
                RenderPlane::Screen,
                DrawCommandKind::RoundedRect,
                *rect,
            )
            // Share the node z so the edge paints in the node's own layer,
            // directly above its fill by insertion order.
            .z_index(z_base.saturating_add(node.z_index))
            .opacity(effective_opacity)
            .clip_bounds(clip_bounds.iter().copied())
            .params(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-border-edge".to_string(),
                corner_radius: 0.0,
                fill_color: color.clone(),
                border: BorderDrawParams::default(),
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
                rotation_degrees: 0.0,
            }));
            let command = apply_provenance(command, &overlay.provenance);
            Some(apply_provenance(command, &node.provenance))
        })
        .collect()
}
