mod background;
mod clip;
mod nodes;

use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    LogicalRect, PanelDrawParams, RenderPlane, RendererIntent,
};

use super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
use super::helpers::{apply_provenance, node_rect, renderer_intent, SurfaceNodeOffset};
use nodes::{
    button_node_command, image_node_command, surface_panel_node_command, text_node_command,
};

pub(super) use background::surface_background_image_command;
pub(super) use clip::scroll_clip_command;

pub(super) fn surface_box_shadow_commands(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) -> Vec<DrawCommand> {
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
    let Some(shadow) = node.style.box_shadow.as_ref() else {
        return Vec::new();
    };
    let bounds = node_rect(node.bounds, offset);
    let blur_radius = shadow.blur_radius.max(0.0);
    let layers: &[f32] = if blur_radius > 0.0 {
        &[0.08, 0.10, 0.12, 0.16, 0.22, 0.32]
    } else {
        &[1.0]
    };
    layers
        .iter()
        .enumerate()
        .map(|(index, opacity)| {
            let progress = if layers.len() == 1 {
                1.0
            } else {
                index as f64 / (layers.len() - 1) as f64
            };
            let expansion = shadow.spread_radius + blur_radius * 0.65 * (1.0 - progress);
            let shadow_bounds = LogicalRect {
                x: bounds.x + shadow.offset_x - expansion,
                y: bounds.y + shadow.offset_y - expansion,
                width: bounds.width + expansion * 2.0,
                height: bounds.height + expansion * 2.0,
            };
            let suffix = if layers.len() == 1 {
                "box-shadow".to_string()
            } else {
                format!("box-shadow:{index}")
            };
            let command = DrawCommand::new(
                format!("ui:{}:{}:{suffix}", overlay.element_id, node.id),
                RenderPlane::Screen,
                DrawCommandKind::RoundedRect,
                shadow_bounds,
            )
            .z_index(z_base.saturating_add(node.z_index).saturating_sub(1))
            .opacity(effective_opacity * opacity)
            .clip_bounds(clip_bounds.iter().copied())
            .params(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-box-shadow".to_string(),
                corner_radius: super::super::style::resolve_border_radius(&node.style, 0.0)
                    + expansion,
                fill_color: shadow.color.clone(),
                border: BorderDrawParams::default(),
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
            }));
            let command = apply_provenance(command, &overlay.provenance);
            apply_provenance(command, &node.provenance)
        })
        .collect()
}

pub(super) fn surface_text_shadow_commands(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) -> Vec<DrawCommand> {
    if !matches!(
        node.kind,
        UiSurfaceNodeKind::Text | UiSurfaceNodeKind::RichText
    ) {
        return Vec::new();
    }
    let Some(shadow) = node.style.text_shadow.as_ref() else {
        return Vec::new();
    };
    let bounds = node_rect(node.bounds, offset);
    let kind = if node.kind == UiSurfaceNodeKind::RichText {
        DrawCommandKind::RichText
    } else {
        DrawCommandKind::Text
    };
    let blur_offset = shadow.blur_radius.clamp(0.0, 32.0) * 0.16;
    let samples: &[(f64, f64, f32)] = if blur_offset > 0.0 {
        &[
            (-1.0, -1.0, 0.06),
            (0.0, -1.0, 0.08),
            (1.0, -1.0, 0.06),
            (-1.0, 0.0, 0.08),
            (0.0, 0.0, 0.36),
            (1.0, 0.0, 0.08),
            (-1.0, 1.0, 0.06),
            (0.0, 1.0, 0.08),
            (1.0, 1.0, 0.06),
        ]
    } else {
        &[(0.0, 0.0, 1.0)]
    };
    samples
        .iter()
        .enumerate()
        .filter_map(|(index, (sample_x, sample_y, opacity))| {
            let shadow_bounds = LogicalRect {
                x: bounds.x + shadow.offset_x + sample_x * blur_offset,
                y: bounds.y + shadow.offset_y + sample_y * blur_offset,
                ..bounds
            };
            let suffix = if samples.len() == 1 {
                "text-shadow".to_string()
            } else {
                format!("text-shadow:{index}")
            };
            let mut command = text_node_command(
                node,
                format!("ui:{}:{}:{suffix}", overlay.element_id, node.id),
                shadow_bounds,
                kind,
                "ui-text-shadow",
            )?;
            if let DrawCommandParams::Text(params) = &mut command.params {
                params.color = shadow.color.clone();
            }
            command = command
                .z_index(z_base.saturating_add(node.z_index).saturating_sub(1))
                .opacity(effective_opacity * opacity)
                .clip_bounds(clip_bounds.iter().copied());
            command = apply_provenance(command, &overlay.provenance);
            Some(apply_provenance(command, &node.provenance))
        })
        .collect()
}

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
        UiSurfaceNodeKind::Box => surface_panel_node_command(
            node,
            command_id,
            bounds,
            "ui-box",
            "rgba(0,0,0,0.0)",
            surface_node_intent(overlay, node),
        ),
        UiSurfaceNodeKind::Backdrop => surface_panel_node_command(
            node,
            command_id,
            bounds,
            "ui-backdrop",
            "rgba(0,0,0,0.56)",
            surface_node_intent(overlay, node),
        ),
        UiSurfaceNodeKind::Button => button_node_command(overlay, node, command_id, bounds)?,
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
        )?,
        UiSurfaceNodeKind::RichText => text_node_command(
            node,
            command_id,
            bounds,
            crate::render_graph::DrawCommandKind::RichText,
            "ui-rich-text",
        )?,
        UiSurfaceNodeKind::Image => image_node_command(node, command_id, bounds)?,
        UiSurfaceNodeKind::Panel => surface_panel_node_command(
            node,
            command_id,
            bounds,
            "ui-panel",
            "rgba(0,0,0,0.0)",
            surface_node_intent(overlay, node),
        ),
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

fn surface_node_intent(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
) -> Option<RendererIntent> {
    node.intent
        .as_ref()
        .and_then(|intent| renderer_intent(overlay, node, intent))
}
