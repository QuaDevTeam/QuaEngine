use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams, LogicalRect, MediaFit,
    MediaOrigin, PanelDrawParams, RenderPlane, RendererIntent, TextAlign, TextDrawParams,
    UiButtonDrawParams,
};
use crate::resources::ResourceId;

use super::style::{
    resolve_background_color, resolve_border_radius, resolve_font_size, resolve_line_height,
    resolve_object_fit, resolve_text_align, resolve_text_color,
};
use super::types::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceNodeRect,
};

const SURFACE_NODE_Z_OFFSET: i32 = 10_000;

pub fn build_ui_surface_node_commands(
    overlay: &UiOverlayProjection,
    surface: &UiOverlaySurfaceProjection,
    base_z_index: i32,
) -> Vec<DrawCommand> {
    let Some(root) = &surface.root else {
        return Vec::new();
    };

    let mut commands = Vec::new();
    append_surface_node_commands(
        &mut commands,
        overlay,
        root,
        base_z_index + SURFACE_NODE_Z_OFFSET,
    );
    commands
}

fn append_surface_node_commands(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
) {
    if !node.visible {
        return;
    }

    commands.push(surface_node_command(overlay, node, z_base));
    for child in &node.children {
        append_surface_node_commands(commands, overlay, child, z_base);
    }
}

fn surface_node_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
) -> DrawCommand {
    let bounds = node_rect(node.bounds);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    let mut command = match node.kind {
        UiSurfaceNodeKind::Box => DrawCommand::new(
            command_id,
            RenderPlane::Screen,
            DrawCommandKind::RoundedRect,
            bounds,
        )
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: "ui-box".to_string(),
            corner_radius: resolve_border_radius(&node.style, 0.0),
            fill_color: resolve_background_color(&node.style, "rgba(0,0,0,0.0)"),
        })),
        UiSurfaceNodeKind::Button => DrawCommand::new(
            command_id,
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            bounds,
        )
        .interactive(node.intent.is_some())
        .params(DrawCommandParams::UiButton(UiButtonDrawParams {
            label: node.text.clone().unwrap_or_default(),
            enabled: node.intent.is_some(),
            role: "ui-button".to_string(),
            background_color: resolve_background_color(&node.style, "rgba(0,0,0,0.0)"),
            text_color: resolve_text_color(&node.style, "#ffffff"),
            corner_radius: resolve_border_radius(&node.style, 0.0),
            intent: node
                .intent
                .as_ref()
                .map(|intent| renderer_intent(overlay, node, intent)),
        })),
        UiSurfaceNodeKind::Text => DrawCommand::new(
            command_id,
            RenderPlane::Screen,
            DrawCommandKind::Text,
            bounds,
        )
        .params(DrawCommandParams::Text(TextDrawParams {
            text: node.text.clone().unwrap_or_default(),
            font_size: resolve_font_size(&node.style, 28.0),
            line_height: resolve_line_height(&node.style, 36.0),
            align: resolve_text_align(&node.style, TextAlign::Left),
            color: resolve_text_color(&node.style, "#ffffff"),
            role: "ui-text".to_string(),
        })),
        UiSurfaceNodeKind::Image => {
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
    };

    command = command
        .z_index(z_base.saturating_add(node.z_index))
        .opacity(node.opacity);
    command = apply_provenance(command, &overlay.provenance);
    apply_provenance(command, &node.provenance)
}

fn renderer_intent(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    intent: &UiIntentProjection,
) -> RendererIntent {
    RendererIntent {
        event: intent.event.clone(),
        choice_id: None,
        element_id: Some(format!("{}:{}", overlay.element_id, node.id)),
        action: intent.action.clone(),
    }
}

fn node_rect(rect: UiSurfaceNodeRect) -> LogicalRect {
    LogicalRect {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = &provenance.content_package_id {
        command = command.owned_by(package_id.clone());
    }

    for package_id in &provenance.required_runtime_packages {
        command = command.require_package(package_id.clone());
    }

    command
}
