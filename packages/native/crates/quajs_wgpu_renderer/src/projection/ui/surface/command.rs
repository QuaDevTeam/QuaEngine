use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams,
    LogicalRect, MediaFit, MediaOrigin, PanelDrawParams, RenderPlane, RendererIntent, TextAlign,
    TextDrawParams, UiButtonDrawParams,
};
use crate::resources::ResourceId;

use super::super::style::{
    resolve_background_color, resolve_border_color, resolve_border_radius, resolve_border_width,
    resolve_font_family, resolve_font_size, resolve_font_weight, resolve_line_height,
    resolve_object_fit, resolve_text_align, resolve_text_color,
};
use super::super::types::{
    UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use super::helpers::{apply_provenance, node_rect, renderer_intent};

pub(super) fn surface_node_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    effective_opacity: f32,
) -> DrawCommand {
    let bounds = node_rect(node.bounds);
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
        UiSurfaceNodeKind::Text => text_node_command(node, command_id, bounds),
        UiSurfaceNodeKind::Image => image_node_command(node, command_id, bounds),
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
    apply_provenance(command, &node.provenance)
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

pub(super) fn scroll_clip_command(
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

fn button_node_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
) -> DrawCommand {
    let font_family = resolve_font_family(&node.style);

    DrawCommand::new(
        command_id,
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        bounds,
    )
    .interactive(node.intent.is_some())
    .resources(font_family_resource_ids(&font_family))
    .params(DrawCommandParams::UiButton(UiButtonDrawParams {
        label: node.text.clone().unwrap_or_default(),
        enabled: node.intent.is_some(),
        role: "ui-button".to_string(),
        background_color: resolve_background_color(&node.style, "rgba(0,0,0,0.0)"),
        text_color: resolve_text_color(&node.style, "#ffffff"),
        corner_radius: resolve_border_radius(&node.style, 0.0),
        border: surface_border_params(&node.style),
        font_family,
        font_size: resolve_font_size(&node.style, 28.0),
        font_weight: resolve_font_weight(&node.style),
        line_height: resolve_line_height(&node.style, 36.0),
        align: resolve_text_align(&node.style, TextAlign::Center),
        intent: node
            .intent
            .as_ref()
            .map(|intent| renderer_intent(overlay, node, intent)),
    }))
}

fn text_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
) -> DrawCommand {
    let font_family = resolve_font_family(&node.style);

    DrawCommand::new(
        command_id,
        RenderPlane::Screen,
        DrawCommandKind::Text,
        bounds,
    )
    .resources(font_family_resource_ids(&font_family))
    .params(DrawCommandParams::Text(TextDrawParams {
        text: node.text.clone().unwrap_or_default(),
        font_family,
        font_size: resolve_font_size(&node.style, 28.0),
        font_weight: resolve_font_weight(&node.style),
        line_height: resolve_line_height(&node.style, 36.0),
        align: resolve_text_align(&node.style, TextAlign::Left),
        color: resolve_text_color(&node.style, "#ffffff"),
        role: "ui-text".to_string(),
    }))
}

fn image_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
) -> DrawCommand {
    let image = node.image.as_ref();
    let mut command = DrawCommand::new(
        command_id,
        RenderPlane::Screen,
        DrawCommandKind::Image,
        bounds,
    )
    .params(DrawCommandParams::Image(ImageDrawParams {
        asset_type: image
            .map(|image| image.asset_type.clone())
            .unwrap_or_else(|| "images".to_string()),
        asset_name: image
            .map(|image| image.asset_name.clone())
            .unwrap_or_default(),
        fit: resolve_object_fit(&node.style, MediaFit::Contain),
        origin: MediaOrigin::default(),
        source: bounds,
    }));

    if let Some(image) = image {
        command = command.resource(ResourceId::new(format!(
            "{}:{}",
            image.asset_type, image.asset_name
        )));
    }

    command
}

fn surface_panel_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
    role: &str,
    fallback_fill_color: &str,
    intent: Option<RendererIntent>,
) -> DrawCommand {
    DrawCommand::new(
        command_id,
        RenderPlane::Screen,
        DrawCommandKind::RoundedRect,
        bounds,
    )
    .interactive(intent.is_some())
    .params(DrawCommandParams::Panel(PanelDrawParams {
        role: role.to_string(),
        corner_radius: resolve_border_radius(&node.style, 0.0),
        fill_color: resolve_background_color(&node.style, fallback_fill_color),
        border: surface_border_params(&node.style),
        intent,
    }))
}

fn surface_border_params(style: &UiSurfaceResolvedStyle) -> BorderDrawParams {
    BorderDrawParams {
        color: resolve_border_color(style),
        width: resolve_border_width(style, 0.0),
    }
}
