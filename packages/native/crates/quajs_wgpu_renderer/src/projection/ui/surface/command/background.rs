use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, GradientDrawKind, GradientDrawParams,
    GradientDrawRadialShape, ImageDrawParams, LogicalRect, MediaFit, MediaOrigin, RenderPlane,
};
use crate::resources::ResourceId;

use super::super::super::style::{
    resolve_background_image, resolve_background_position, resolve_background_size,
    resolve_image_filter,
};
use super::super::super::types::{
    UiOverlayProjection, UiSurfaceGradientKindProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceRadialGradientShapeProjection,
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
    let (brightness, saturation, contrast, grayscale, sepia, hue_rotate_radians, invert) =
        resolve_image_filter(&node.style);
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
        sampling: Default::default(),
        asset_type: image.asset_type.clone(),
        asset_name: image.asset_name.clone(),
        fit: resolve_background_size(&node.style, MediaFit::Cover),
        origin: resolve_background_position(&node.style, MediaOrigin::default()),
        source: bounds,
        rotation_degrees: 0.0,
        brightness,
        saturation,
        contrast,
        grayscale,
        sepia,
        hue_rotate_radians,
        invert,
    }));

    command = apply_provenance(command, &overlay.provenance);
    Some(apply_provenance(command, &node.provenance))
}

/// Returns zero or more gradient draw commands for the node's background.
/// Multi-stop gradients emit one non-overlapping command per adjacent stop
/// pair. The shader discards fragments outside each segment's interval, while
/// the edge segments extend the first/last CSS stop colors.
pub(in crate::projection::ui::surface) fn surface_background_gradient_command(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    command_id: &str,
    bounds: LogicalRect,
    effective_opacity: f32,
) -> Vec<DrawCommand> {
    if !supports_background_image(node.kind) {
        return Vec::new();
    }
    let Some(gradient) = node.style.background_gradient.as_ref() else {
        return Vec::new();
    };
    let corner_radius = super::super::super::style::resolve_border_radius(&node.style, 0.0);
    let draw_kind = match gradient.kind {
        UiSurfaceGradientKindProjection::Linear => GradientDrawKind::Linear,
        UiSurfaceGradientKindProjection::Radial => GradientDrawKind::Radial,
    };
    let radial_shape = match gradient.shape {
        Some(UiSurfaceRadialGradientShapeProjection::Ellipse) => GradientDrawRadialShape::Ellipse,
        _ => GradientDrawRadialShape::Circle,
    };
    let angle_degrees = gradient.angle_degrees.unwrap_or(180.0);
    let center_x = gradient.center_x.unwrap_or(0.5);
    let center_y = gradient.center_y.unwrap_or(0.5);
    let radius = gradient.radius.unwrap_or(0.707_106_781_18);

    let segments: Vec<(String, String, f64, f64)> = gradient
        .stops
        .windows(2)
        .filter(|pair| {
            pair[0].position.is_finite()
                && pair[1].position.is_finite()
                && pair[0].position >= 0.0
                && pair[1].position <= 1.0
                && pair[0].position < pair[1].position
        })
        .map(|pair| {
            (
                pair[0].color.clone(),
                pair[1].color.clone(),
                pair[0].position,
                pair[1].position,
            )
        })
        .collect();
    let last_segment_index = segments.len().saturating_sub(1);

    segments
        .into_iter()
        .enumerate()
        .map(
            |(segment_idx, (start_color, end_color, start_offset, end_offset))| {
                let cmd_id = if segment_idx == 0 {
                    format!("{command_id}:background-gradient")
                } else {
                    format!("{command_id}:background-gradient-{segment_idx}")
                };
                let command = DrawCommand::new(
                    cmd_id,
                    RenderPlane::Screen,
                    DrawCommandKind::RoundedRect,
                    bounds,
                )
                .z_index(z_base.saturating_add(node.z_index))
                .opacity(effective_opacity)
                .clip_bounds(clip_bounds.iter().copied())
                .params(DrawCommandParams::Gradient(GradientDrawParams {
                    role: "ui-background-gradient".to_string(),
                    kind: draw_kind,
                    start_color,
                    end_color,
                    angle_degrees,
                    center_x,
                    center_y,
                    radius,
                    radial_shape,
                    start_offset,
                    end_offset,
                    fill_before_start: segment_idx == 0,
                    fill_after_end: segment_idx == last_segment_index,
                    corner_radius,
                }));
                let command = apply_provenance(command, &overlay.provenance);
                apply_provenance(command, &node.provenance)
            },
        )
        .collect()
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
