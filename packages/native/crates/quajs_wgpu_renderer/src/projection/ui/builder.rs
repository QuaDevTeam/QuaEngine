use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_name,
    is_safe_native_dispatch_identifier, PackageProvenance,
};
use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane, RendererIntent,
    UiSurfaceDrawParams,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{
    compare_ui_overlay_projection, resolve_ui_overlay_placement, ui_overlay_bounds,
    ui_overlay_is_interactive, ui_overlay_render_mode, ui_overlay_render_mode_name,
    ui_overlay_surface, ResolvedUiOverlayPlacement,
};
use super::surface::build_ui_surface_node_commands;
use super::types::{UiIntentProjection, UiOverlayProjection, UiProjection};

pub fn append_ui_commands(graph: &mut RenderGraph, ui: &UiProjection) {
    graph.extend(build_ui_commands(&graph.layout, ui));
}

pub fn build_ui_commands(layout: &ResolvedStageLayout, ui: &UiProjection) -> Vec<DrawCommand> {
    if !ui.visible || ui.overlays.is_empty() {
        return Vec::new();
    }

    let mut seen_overlay_ids = std::collections::BTreeSet::new();
    let mut overlays = ui
        .overlays
        .iter()
        .filter(|overlay| {
            overlay.visible
                && insert_unique_safe_native_dispatch_identifier(
                    &mut seen_overlay_ids,
                    &overlay.element_id,
                )
        })
        .collect::<Vec<_>>();
    overlays.sort_by(|left, right| compare_ui_overlay_projection(left, right));

    let mut commands = Vec::new();
    for overlay in overlays {
        commands.extend(ui_overlay_commands(layout, ui, overlay));
    }
    commands
}

fn ui_overlay_commands(
    layout: &ResolvedStageLayout,
    ui: &UiProjection,
    overlay: &UiOverlayProjection,
) -> Vec<DrawCommand> {
    let placement = resolve_ui_overlay_placement(overlay);
    let surface = ui_overlay_surface(overlay);
    let mut commands = vec![ui_overlay_command(layout, ui, overlay, &placement, surface)];

    if let Some(surface) = surface {
        commands.extend(build_ui_surface_node_commands(
            overlay,
            surface,
            placement.effective_z_index,
        ));
    }

    commands
}

fn ui_overlay_command(
    layout: &ResolvedStageLayout,
    ui: &UiProjection,
    overlay: &UiOverlayProjection,
    placement: &ResolvedUiOverlayPlacement,
    surface: Option<&super::types::UiOverlaySurfaceProjection>,
) -> DrawCommand {
    let render_mode = ui_overlay_render_mode(overlay);
    let interactive = ui_overlay_is_interactive(overlay);
    let surface_key = surface
        .map(|surface| surface.key.as_str())
        .filter(|key| is_safe_native_asset_name(key))
        .map(ToString::to_string);

    let mut command = DrawCommand::new(
        format!("ui:{}", overlay.element_id),
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        ui_overlay_bounds(layout),
    )
    .z_index(placement.effective_z_index)
    .interactive(interactive)
    .params(DrawCommandParams::UiSurface(UiSurfaceDrawParams {
        element_id: overlay.element_id.clone(),
        surface_key: surface_key.clone(),
        render_mode: ui_overlay_render_mode_name(render_mode).to_string(),
        overlay_stack: placement.overlay_stack.clone(),
        interactive,
        intent: overlay
            .intent
            .as_ref()
            .and_then(|intent| renderer_intent(overlay, intent)),
    }));

    if let Some(surface_key) = surface_key {
        command = command.resource(ResourceId::new(format!("surface:{surface_key}")));
    }

    command = apply_provenance(command, &ui.provenance);
    apply_provenance(command, &overlay.provenance)
}

fn renderer_intent(
    overlay: &UiOverlayProjection,
    intent: &UiIntentProjection,
) -> Option<RendererIntent> {
    let action = match intent.action.as_deref() {
        Some(action) if is_safe_native_dispatch_identifier(action) => Some(action.to_string()),
        Some(_) => return None,
        None => None,
    };
    let choice_id = match intent.choice_id.as_deref() {
        Some(choice_id) if is_safe_native_dispatch_identifier(choice_id) => {
            Some(choice_id.to_string())
        }
        Some(_) => return None,
        None if intent.event == "choice/select" => return None,
        None => None,
    };
    let metadata = intent
        .metadata
        .iter()
        .filter(|(key, _)| is_safe_native_dispatch_identifier(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    Some(RendererIntent {
        event: intent.event.clone(),
        choice_id,
        element_id: Some(overlay.element_id.clone()),
        action,
        metadata,
    })
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }

    for package_id in provenance.safe_required_runtime_packages() {
        command = command.require_package(package_id);
    }

    command
}
