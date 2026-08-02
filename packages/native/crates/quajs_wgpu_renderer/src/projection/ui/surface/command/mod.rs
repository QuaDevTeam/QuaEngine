mod background;
mod border;
mod clip;
mod nodes;

use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, LogicalRect, RenderPlane, RendererIntent,
    ShadowDrawParams, ShadowDrawStyle,
};

use super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
use super::helpers::{
    apply_provenance, node_rect, renderer_control, renderer_intent, SurfaceNodeOffset,
};
use nodes::{
    button_node_command, image_node_command, surface_panel_node_command, text_node_command,
};

pub(super) use background::{
    surface_background_gradient_command, surface_background_image_command,
};
pub(super) use border::surface_border_edge_commands;
pub(super) use clip::scroll_clip_command;

const MAX_NATIVE_SHADOW_BLUR_RADIUS: f64 = 256.0;

pub(super) fn surface_box_shadow_commands(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
    style: ShadowDrawStyle,
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
    if shadow.inset != matches!(style, ShadowDrawStyle::Inset) {
        return Vec::new();
    }
    let bounds = node_rect(node.bounds, offset);
    let blur_radius = shadow.blur_radius.clamp(0.0, MAX_NATIVE_SHADOW_BLUR_RADIUS);
    let spread_radius = shadow.spread_radius;
    let shadow_shape = LogicalRect {
        x: bounds.x + shadow.offset_x - spread_radius,
        y: bounds.y + shadow.offset_y - spread_radius,
        width: bounds.width + spread_radius * 2.0,
        height: bounds.height + spread_radius * 2.0,
    };
    if shadow_shape.is_empty() {
        return Vec::new();
    }
    // Chromium maps CSS blur radius to sigma ~= radius / 2 and keeps roughly
    // three sigma of the transition. This bounds the analytic draw while
    // retaining the visible tail of the Gaussian profile.
    let blur_extent = blur_radius * 1.5;
    let shadow_bounds = if shadow.inset {
        bounds
    } else {
        LogicalRect {
            x: shadow_shape.x - blur_extent,
            y: shadow_shape.y - blur_extent,
            width: shadow_shape.width + blur_extent * 2.0,
            height: shadow_shape.height + blur_extent * 2.0,
        }
    };
    let command = DrawCommand::new(
        format!("ui:{}:{}:box-shadow", overlay.element_id, node.id),
        RenderPlane::Screen,
        DrawCommandKind::RoundedRect,
        shadow_bounds,
    )
    // Keep the shadow in the node's paint layer; RenderGraph's stable sort
    // preserves outer-shadow -> fill -> inset-shadow insertion order.
    .z_index(z_base.saturating_add(node.z_index))
    .opacity(effective_opacity)
    .clip_bounds(clip_bounds.iter().copied())
    .params(DrawCommandParams::Shadow(ShadowDrawParams {
        role: "ui-box-shadow".to_string(),
        source_bounds: bounds,
        offset_x: shadow.offset_x,
        offset_y: shadow.offset_y,
        blur_radius,
        spread_radius,
        corner_radius: super::super::style::resolve_border_radius(&node.style, 0.0),
        color: shadow.color.clone(),
        style,
    }));
    let command = apply_provenance(command, &overlay.provenance);
    vec![apply_provenance(command, &node.provenance)]
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
    if shadow.inset || shadow.spread_radius != 0.0 {
        return Vec::new();
    }
    let bounds = node_rect(node.bounds, offset);
    let kind = if node.kind == UiSurfaceNodeKind::RichText {
        DrawCommandKind::RichText
    } else {
        DrawCommandKind::Text
    };
    let blur_radius = shadow.blur_radius.clamp(0.0, MAX_NATIVE_SHADOW_BLUR_RADIUS);
    let blur_extent = blur_radius * 1.5;
    let shadow_bounds = LogicalRect {
        x: bounds.x + shadow.offset_x - blur_extent,
        y: bounds.y + shadow.offset_y - blur_extent,
        width: bounds.width + blur_extent * 2.0,
        height: bounds.height + blur_extent * 2.0,
    };
    let Some(mut command) = text_node_command(
        node,
        format!("ui:{}:{}:text-shadow", overlay.element_id, node.id),
        shadow_bounds,
        kind,
        "ui-text-shadow",
    ) else {
        return Vec::new();
    };
    if let DrawCommandParams::Text(params) = &mut command.params {
        params.color = shadow.color.clone();
        params.blur_radius = blur_radius;
        params.padding.top += blur_extent;
        params.padding.right += blur_extent;
        params.padding.bottom += blur_extent;
        params.padding.left += blur_extent;
    }
    command = command
        .z_index(z_base.saturating_add(node.z_index))
        .opacity(effective_opacity)
        .clip_bounds(clip_bounds.iter().copied());
    command = apply_provenance(command, &overlay.provenance);
    vec![apply_provenance(command, &node.provenance)]
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

    if let Some(control) = renderer_control(overlay, node) {
        command = command.interactive(true).control(control);
    }

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
