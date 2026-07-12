use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, GradientDrawKind, GradientDrawParams,
    ImageDrawParams, LogicalRect, MediaFit, MediaOrigin, RenderPlane,
};
use crate::resources::ResourceId;

use super::super::super::style::{
    resolve_background_image, resolve_background_position, resolve_background_size,
    resolve_image_filter,
};
use super::super::super::types::{
    UiOverlayProjection, UiSurfaceGradientKindProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection,
};
use super::super::helpers::apply_provenance;

pub(in crate::projection::ui::surface) fn surface_background_image_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
    effective_opacity: f32,
) -> Option<DrawCommand> {
    if !supports_background_image(node.kind) {
        return None;
    }

    let image = resolve_background_image(&node.style)?;
    let (brightness, saturation) = resolve_image_filter(&node.style);
    let mut command = DrawCommand::new(
        format!("{command_id}:background-image"),
        RenderPlane::Screen,
        DrawCommandKind::Image,
        bounds,
    )
    // Background layers share the node z so earlier sibling surfaces cannot
    // overpaint them merely because their local layer is painted first.
    .z_index(z_base.saturating_add(node.z_index))
    .opacity(effective_opacity)
    .clip_bounds(clip_bounds.iter().copied())
    .resource(ResourceId::new(format!(
        "{}:{}",
        image.asset_type, image.asset_name
    )))
    .params(DrawCommandParams::Image(ImageDrawParams {
        asset_type: image.asset_type.clone(),
        asset_name: image.asset_name.clone(),
        fit: resolve_background_size(&node.style, MediaFit::Cover),
        origin: resolve_background_position(&node.style, MediaOrigin::default()),
        source: bounds,
        rotation_degrees: 0.0,
        brightness,
        saturation,
    }));

    command = apply_provenance(command, &overlay.provenance);
    Some(apply_provenance(command, &node.provenance))
}

pub(in crate::projection::ui::surface) fn surface_background_gradient_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
    effective_opacity: f32,
) -> Option<DrawCommand> {
    if !supports_background_image(node.kind) {
        return None;
    }

    let gradient = node.style.background_gradient.as_ref()?;
    let command = DrawCommand::new(
        format!("{command_id}:background-gradient"),
        RenderPlane::Screen,
        DrawCommandKind::RoundedRect,
        bounds,
    )
    .z_index(z_base.saturating_add(node.z_index))
    .opacity(effective_opacity)
    .clip_bounds(clip_bounds.iter().copied())
    .params(DrawCommandParams::Gradient(GradientDrawParams {
        role: "ui-background-gradient".to_string(),
        kind: match gradient.kind {
            UiSurfaceGradientKindProjection::Linear => GradientDrawKind::Linear,
            UiSurfaceGradientKindProjection::Radial => GradientDrawKind::Radial,
        },
        start_color: gradient.start_color.clone(),
        end_color: gradient.end_color.clone(),
        angle_degrees: gradient.angle_degrees.unwrap_or(180.0),
        center_x: gradient.center_x.unwrap_or(0.5),
        center_y: gradient.center_y.unwrap_or(0.5),
        radius: gradient.radius.unwrap_or(0.707_106_781_18),
        corner_radius: super::super::super::style::resolve_border_radius(&node.style, 0.0),
    }));
    let command = apply_provenance(command, &overlay.provenance);
    Some(apply_provenance(command, &node.provenance))
}

fn supports_background_image(kind: UiSurfaceNodeKind) -> bool {
    matches!(
        kind,
        UiSurfaceNodeKind::Box
            | UiSurfaceNodeKind::Backdrop
            | UiSurfaceNodeKind::Button
            | UiSurfaceNodeKind::Panel
            | UiSurfaceNodeKind::Scroll
    )
}
