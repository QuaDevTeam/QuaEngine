use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams,
    LogicalRect, MediaFit, MediaOrigin, PanelDrawParams, RenderPlane, RendererIntent, TextAlign,
    TextDrawParams, UiButtonDrawParams,
};
use crate::resources::ResourceId;

use super::super::super::style::{
    resolve_background_color, resolve_border_color, resolve_border_radius, resolve_border_width,
    resolve_font_family, resolve_font_size, resolve_font_style, resolve_font_weight,
    resolve_letter_spacing, resolve_line_height, resolve_object_fit, resolve_padding,
    resolve_text_align, resolve_text_color, resolve_text_decoration, resolve_text_overflow,
    resolve_text_transform, resolve_white_space,
};
use super::super::super::types::{
    UiOverlayProjection, UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use super::super::helpers::renderer_intent;

pub(super) fn button_node_command(
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
        font_style: resolve_font_style(&node.style),
        font_weight: resolve_font_weight(&node.style),
        letter_spacing: resolve_letter_spacing(&node.style),
        line_height: resolve_line_height(&node.style, 36.0),
        align: resolve_text_align(&node.style, TextAlign::Center),
        text_decoration: resolve_text_decoration(&node.style),
        text_overflow: resolve_text_overflow(&node.style),
        text_transform: resolve_text_transform(&node.style),
        white_space: resolve_white_space(&node.style),
        padding: resolve_padding(&node.style),
        intent: node
            .intent
            .as_ref()
            .map(|intent| renderer_intent(overlay, node, intent)),
    }))
}

pub(super) fn text_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
    kind: DrawCommandKind,
    role: &str,
) -> DrawCommand {
    let font_family = resolve_font_family(&node.style);

    DrawCommand::new(command_id, RenderPlane::Screen, kind, bounds)
        .resources(font_family_resource_ids(&font_family))
        .params(DrawCommandParams::Text(TextDrawParams {
            text: node.text.clone().unwrap_or_default(),
            font_family,
            font_size: resolve_font_size(&node.style, 28.0),
            font_style: resolve_font_style(&node.style),
            font_weight: resolve_font_weight(&node.style),
            letter_spacing: resolve_letter_spacing(&node.style),
            line_height: resolve_line_height(&node.style, 36.0),
            align: resolve_text_align(&node.style, TextAlign::Left),
            text_decoration: resolve_text_decoration(&node.style),
            text_overflow: resolve_text_overflow(&node.style),
            text_transform: resolve_text_transform(&node.style),
            white_space: resolve_white_space(&node.style),
            color: resolve_text_color(&node.style, "#ffffff"),
            padding: resolve_padding(&node.style),
            role: role.to_string(),
        }))
}

pub(super) fn image_node_command(
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
        rotation_degrees: 0.0,
    }));

    if let Some(image) = image {
        command = command.resource(ResourceId::new(format!(
            "{}:{}",
            image.asset_type, image.asset_name
        )));
    }

    command
}

pub(super) fn surface_panel_node_command(
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
        padding: resolve_padding(&node.style),
        intent,
    }))
}

fn surface_border_params(style: &UiSurfaceResolvedStyle) -> BorderDrawParams {
    BorderDrawParams {
        color: resolve_border_color(style),
        width: resolve_border_width(style, 0.0),
    }
}
