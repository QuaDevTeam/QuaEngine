use crate::projection::common::is_safe_native_asset_ref;
use crate::projection::safety::is_safe_native_text_payload;
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
    resolve_letter_spacing, resolve_line_height, resolve_object_fit, resolve_object_position,
    resolve_padding, resolve_rotate_deg, resolve_text_align, resolve_text_color,
    resolve_text_decoration, resolve_text_overflow, resolve_text_transform, resolve_white_space,
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
) -> Option<DrawCommand> {
    let label = node.text.as_deref().unwrap_or_default();
    if !is_safe_native_text_payload(label) {
        return None;
    }

    let font_family = resolve_font_family(&node.style);
    let intent = node
        .intent
        .as_ref()
        .and_then(|intent| renderer_intent(overlay, node, intent));
    let enabled = intent.is_some();

    Some(
        DrawCommand::new(
            command_id,
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            bounds,
        )
        .interactive(enabled)
        .resources(font_family_resource_ids(&font_family))
        .params(DrawCommandParams::UiButton(UiButtonDrawParams {
            label: label.to_string(),
            enabled,
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
            intent,
        })),
    )
}

pub(super) fn text_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
    kind: DrawCommandKind,
    role: &str,
) -> Option<DrawCommand> {
    let text = node.text.as_deref().unwrap_or_default();
    if !is_safe_native_text_payload(text) {
        return None;
    }

    let font_family = resolve_font_family(&node.style);

    Some(
        DrawCommand::new(command_id, RenderPlane::Screen, kind, bounds)
            .resources(font_family_resource_ids(&font_family))
            .params(DrawCommandParams::Text(TextDrawParams {
                text: text.to_string(),
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
                // Wire the text-shadow blur radius from the resolved style.
                // `surface_text_shadow_commands` generates a separate blurred draw for
                // the shadow itself; `blur_radius` here is the text-body glow (CSS
                // `filter: blur(Npx)` on the text layer itself), not the shadow blur.
                blur_radius: 0.0,
                padding: resolve_padding(&node.style),
                role: role.to_string(),
                rotation_degrees: resolve_rotate_deg(&node.style),
            })),
    )
}

pub(super) fn image_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
) -> Option<DrawCommand> {
    let image = node
        .image
        .as_ref()
        .filter(|image| is_safe_native_asset_ref(&image.asset_type, &image.asset_name))?;
    let (brightness, saturation, contrast, grayscale, sepia, hue_rotate_radians, invert) =
        super::super::super::style::resolve_image_filter(&node.style);
    let command = DrawCommand::new(
        command_id,
        RenderPlane::Screen,
        DrawCommandKind::Image,
        bounds,
    )
    .resource(ResourceId::new(format!(
        "{}:{}",
        image.asset_type, image.asset_name
    )))
    .params(DrawCommandParams::Image(ImageDrawParams {
        asset_type: image.asset_type.clone(),
        asset_name: image.asset_name.clone(),
        fit: resolve_object_fit(&node.style, MediaFit::Contain),
        origin: resolve_object_position(&node.style, MediaOrigin::default()),
        source: bounds,
        rotation_degrees: resolve_rotate_deg(&node.style),
        brightness,
        saturation,
        contrast,
        grayscale,
        sepia,
        hue_rotate_radians,
        invert,
    }));

    Some(command)
}

pub(super) fn surface_panel_node_command(
    node: &UiSurfaceNodeProjection,
    command_id: String,
    bounds: LogicalRect,
    role: &str,
    fallback_fill_color: &str,
    intent: Option<RendererIntent>,
) -> DrawCommand {
    let role = match node.role.as_deref() {
        Some("ui-select-chevron-down") => "ui-select-chevron-down",
        Some("ui-select-chevron-up") => "ui-select-chevron-up",
        Some("ui-chevron-right") => "ui-chevron-right",
        Some("ui-chevron-left") => "ui-chevron-left",
        _ => role,
    };
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
        rotation_degrees: resolve_rotate_deg(&node.style),
    }))
}

fn surface_border_params(style: &UiSurfaceResolvedStyle) -> BorderDrawParams {
    BorderDrawParams {
        color: resolve_border_color(style),
        width: resolve_border_width(style, 0.0),
    }
}
