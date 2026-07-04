use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams, LogicalRect, MediaFit,
    MediaOrigin, RenderPlane,
};
use crate::resources::ResourceId;

use super::super::super::style::{
    resolve_background_image, resolve_background_position, resolve_background_size,
};
use super::super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
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
    let mut command = DrawCommand::new(
        format!("{command_id}:background-image"),
        RenderPlane::Screen,
        DrawCommandKind::Image,
        bounds,
    )
    .z_index(z_base.saturating_add(node.z_index).saturating_sub(1))
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
    }));

    command = apply_provenance(command, &overlay.provenance);
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
