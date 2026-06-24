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
const SCROLL_CHILD_Z_OFFSET: i32 = 1;
const SCROLL_CLIP_END_Z_OFFSET: i32 = 1_000_000;

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
        &[],
    );
    commands
}

fn append_surface_node_commands(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
) {
    if !node.visible {
        return;
    }

    if node.kind == UiSurfaceNodeKind::Fragment {
        for child in &node.children {
            append_surface_node_commands(commands, overlay, child, z_base, clip_bounds);
        }
        return;
    }

    if node.kind == UiSurfaceNodeKind::Spacer {
        return;
    }

    if node.kind == UiSurfaceNodeKind::SafeArea {
        let mut child_clip_bounds = clip_bounds.to_vec();
        child_clip_bounds.push(node_rect(node.bounds));
        for child in &node.children {
            append_surface_node_commands(commands, overlay, child, z_base, &child_clip_bounds);
        }
        return;
    }

    if node.kind == UiSurfaceNodeKind::Scroll {
        append_scroll_node_commands(commands, overlay, node, z_base, clip_bounds);
        return;
    }

    commands.push(surface_node_command(overlay, node, z_base, clip_bounds));
    for child in &node.children {
        append_surface_node_commands(commands, overlay, child, z_base, clip_bounds);
    }
}

fn append_scroll_node_commands(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
) {
    let bounds = node_rect(node.bounds);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    commands.push(surface_scroll_panel_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
    ));
    commands.push(scroll_clip_command(
        overlay,
        node,
        z_base.saturating_add(SCROLL_CHILD_Z_OFFSET),
        clip_bounds,
        &format!("{command_id}:clip-start"),
        DrawCommandKind::ClipStart,
        bounds,
    ));

    let mut child_clip_bounds = clip_bounds.to_vec();
    child_clip_bounds.push(bounds);
    let child_z_base = z_base.saturating_add(SCROLL_CHILD_Z_OFFSET * 2);
    for child in &node.children {
        append_surface_node_commands(commands, overlay, child, child_z_base, &child_clip_bounds);
    }

    commands.push(scroll_clip_command(
        overlay,
        node,
        z_base.saturating_add(SCROLL_CLIP_END_Z_OFFSET),
        clip_bounds,
        &format!("{command_id}:clip-end"),
        DrawCommandKind::ClipEnd,
        bounds,
    ));
}

fn surface_node_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
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
        UiSurfaceNodeKind::Divider => surface_panel_node_command(
            node,
            command_id,
            bounds,
            "ui-divider",
            "rgba(255,255,255,0.18)",
            None,
        ),
        UiSurfaceNodeKind::Fragment => {
            unreachable!("fragment nodes are expanded before command build")
        }
        UiSurfaceNodeKind::SafeArea => {
            unreachable!("safe-area nodes are expanded before command build")
        }
        UiSurfaceNodeKind::Spacer => {
            unreachable!("spacer nodes are skipped before command build")
        }
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
        .opacity(node.opacity)
        .clip_bounds(clip_bounds.iter().copied());
    command = apply_provenance(command, &overlay.provenance);
    apply_provenance(command, &node.provenance)
}

fn surface_scroll_panel_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
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
    .opacity(node.opacity)
    .clip_bounds(clip_bounds.iter().copied());

    let command = apply_provenance(command, &overlay.provenance);
    apply_provenance(command, &node.provenance)
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
        intent,
    }))
}

fn scroll_clip_command(
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
