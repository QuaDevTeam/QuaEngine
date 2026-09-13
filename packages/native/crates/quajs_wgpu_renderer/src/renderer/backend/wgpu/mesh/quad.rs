use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};
use crate::resources::ResourceId;

use super::super::physical::WgpuPhysicalRect;
use super::super::primitive::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};
use super::color::parse_color_literal;
use super::geometry::primitive_geometry;
use super::paint::{
    paint_from_primitive, WgpuNativeRenderPaint, WgpuNativeRenderQuadBorder,
    WgpuNativeRenderTextOverlay,
};
use super::vertex::WgpuNativeRenderVertex;

const QUAD_INDICES: [u16; 6] = [0, 1, 2, 0, 2, 3];
const DISABLED_BUTTON_OPACITY_MULTIPLIER: f32 = 0.55;

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderQuad {
    pub command_id: String,
    pub pipeline: DrawBatchPipeline,
    pub draw_kind: DrawCommandKind,
    pub physical_bounds: WgpuPhysicalRect,
    pub scissor: Option<WgpuPhysicalRect>,
    pub vertices: [WgpuNativeRenderVertex; 4],
    pub indices: [u16; 6],
    pub paint: WgpuNativeRenderPaint,
    pub opacity: f32,
    pub corner_radius: f32,
    pub effect0: [f32; 4],
    pub effect1: [f32; 4],
    pub effect2: [f32; 4],
    pub border: Option<WgpuNativeRenderQuadBorder>,
    pub text_overlay: Option<WgpuNativeRenderTextOverlay>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub resource_ids: Vec<ResourceId>,
}

impl WgpuNativeRenderQuad {
    pub(super) fn from_primitive_with_texture_size(
        primitive: &WgpuNativeRenderPrimitive,
        texture_size: Option<(u32, u32)>,
    ) -> Self {
        let (paint, corner_radius, border, text_overlay) = paint_from_primitive(primitive);
        let mut geometry = primitive_geometry(primitive, texture_size);
        if let WgpuNativeRenderPrimitiveKind::Panel { role, .. } = &primitive.kind {
            match role.as_str() {
                "ui-select-chevron-down" => apply_triangle_vertices(&mut geometry.vertices, false),
                "ui-select-chevron-up" => apply_triangle_vertices(&mut geometry.vertices, true),
                "ui-chevron-right" => {
                    apply_horizontal_triangle_vertices(&mut geometry.vertices, true)
                }
                "ui-chevron-left" => {
                    apply_horizontal_triangle_vertices(&mut geometry.vertices, false)
                }
                _ => {}
            }
        }
        if let WgpuNativeRenderPrimitiveKind::Shadow {
            source_offset_x,
            source_offset_y,
            source_width,
            source_height,
            ..
        } = &primitive.kind
        {
            let source_width = (*source_width as f32).max(1.0);
            let source_height = (*source_height as f32).max(1.0);
            let source_x = primitive.physical_bounds.x as f32 + *source_offset_x as f32;
            let source_y = primitive.physical_bounds.y as f32 + *source_offset_y as f32;
            for vertex in &mut geometry.vertices {
                vertex.uv = [
                    (vertex.position[0] - source_x) / source_width,
                    (vertex.position[1] - source_y) / source_height,
                ];
            }
        }
        if matches!(
            primitive.kind,
            WgpuNativeRenderPrimitiveKind::Gradient { .. }
        ) {
            apply_gradient_aspect_uv(&mut geometry.vertices, quad_aspect(primitive));
        }
        let (effect0, effect1) = effect_params_from_primitive(primitive);
        let mut effect2 = gradient_segment_params_from_primitive(primitive);
        if let (WgpuNativeRenderPrimitiveKind::Image { sampling, .. }, Some((w, h))) =
            (&primitive.kind, texture_size)
        {
            if let Some(frame) = sampling.frame.filter(|_| w > 0 && h > 0) {
                effect2 = [
                    ((frame.x + 0.5) / w as f64) as f32,
                    ((frame.y + 0.5) / h as f64) as f32,
                    ((frame.x + frame.width - 0.5) / w as f64) as f32,
                    ((frame.y + frame.height - 0.5) / h as f64) as f32,
                ];
            }
        }

        Self {
            command_id: primitive.command_id.clone(),
            pipeline: primitive.pipeline,
            draw_kind: primitive.draw_kind,
            physical_bounds: primitive.physical_bounds,
            scissor: geometry.scissor,
            vertices: geometry.vertices,
            indices: QUAD_INDICES,
            paint,
            opacity: if valid_atlas_frame(primitive, texture_size) {
                opacity_from_primitive(primitive)
            } else {
                0.0
            },
            corner_radius,
            effect0,
            effect1,
            effect2,
            border,
            text_overlay,
            owner_package_id: primitive.owner_package_id.clone(),
            required_package_ids: primitive.required_package_ids.clone(),
            resource_ids: primitive.resource_ids.clone(),
        }
    }

    pub fn is_visible(&self) -> bool {
        !self.physical_bounds.is_empty()
            && self.scissor.map_or(true, |rect| !rect.is_empty())
            && self.opacity > 0.0
            && self.paint.is_drawable()
            && !self.paint.has_invalid_color()
    }
}

fn valid_atlas_frame(primitive: &WgpuNativeRenderPrimitive, size: Option<(u32, u32)>) -> bool {
    let WgpuNativeRenderPrimitiveKind::Image { sampling, .. } = &primitive.kind else {
        return true;
    };
    let Some(frame) = sampling.frame else {
        return true;
    };
    let Some((width, height)) = size else {
        return false;
    };
    // Atlas coordinates cannot be interpreted without decoded dimensions.
    // Never fall back to displaying the complete atlas for an invalid frame.
    [frame.x, frame.y, frame.width, frame.height]
        .iter()
        .all(|n| n.is_finite())
        && frame.x >= 0.0
        && frame.y >= 0.0
        && frame.width >= 1.0
        && frame.height >= 1.0
        && frame.x + frame.width <= width as f64
        && frame.y + frame.height <= height as f64
}

fn effect_params_from_primitive(primitive: &WgpuNativeRenderPrimitive) -> ([f32; 4], [f32; 4]) {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Shadow {
            offset_x,
            offset_y,
            source_width,
            source_height,
            blur_radius,
            spread_radius,
            corner_radius,
            inset,
            ..
        } => (
            [
                if *inset { 2.0 } else { 1.0 },
                (*blur_radius as f32 * 0.5).max(0.0),
                (*corner_radius as f32).max(0.0),
                *spread_radius as f32,
            ],
            [
                *offset_x as f32,
                *offset_y as f32,
                (*source_width as f32).max(1.0),
                -(*source_height as f32).max(1.0),
            ],
        ),
        WgpuNativeRenderPrimitiveKind::Gradient {
            kind,
            end_color,
            angle_degrees,
            center_x,
            center_y,
            radius,
            ..
        } => {
            let mut end_color = parse_color_literal(end_color)
                .map(|color| color.to_gpu_rgba())
                .unwrap_or([0.0; 4]);
            end_color[3] *= primitive.opacity;
            // UVs were pre-warped by `apply_gradient_aspect_uv`, so one uv unit
            // is one quad-width unit on both axes. That makes CSS gradient math
            // work in pixel space: radial extents stay circular and linear
            // angles are not skewed by a non-square quad.
            let aspect = gradient_uv_aspect(primitive);
            let parameters = match kind {
                crate::render_graph::GradientDrawKind::Linear => {
                    let radians = angle_degrees.to_radians();
                    let direction = (radians.sin(), -radians.cos());
                    // CSS gradient line length for an angle over a w*h box.
                    let extent = 0.5 * (direction.0.abs() + aspect * direction.1.abs());
                    let scale = 1.0 / (2.0 * extent.max(f64::EPSILON));
                    [
                        (direction.0 * scale) as f32,
                        (direction.1 * scale) as f32,
                        0.5,
                        4.0,
                    ]
                }
                crate::render_graph::GradientDrawKind::Radial => [
                    *center_x as f32,
                    // Match the same pre-warp applied to the vertex UVs.
                    ((center_y - 0.5) * aspect + 0.5) as f32,
                    (1.0 / radius.max(0.0001)) as f32,
                    5.0,
                ],
            };
            (end_color, parameters)
        }
        WgpuNativeRenderPrimitiveKind::Image {
            brightness,
            saturation,
            contrast,
            grayscale,
            sepia,
            hue_rotate_radians,
            invert,
            ..
        } if (*brightness - 1.0).abs() > f64::EPSILON
            || (*saturation - 1.0).abs() > f64::EPSILON
            || (*contrast - 1.0).abs() > f64::EPSILON
            || *grayscale > f64::EPSILON
            || *sepia > f64::EPSILON
            || hue_rotate_radians.abs() > f64::EPSILON
            || *invert > f64::EPSILON =>
        {
            // effect0: [brightness, saturation, contrast, grayscale]
            // effect1: [activation_flag, sepia, hue_rotate_radians, invert]
            (
                [
                    *brightness as f32,
                    *saturation as f32,
                    *contrast as f32,
                    *grayscale as f32,
                ],
                [
                    1.0,
                    *sepia as f32,
                    *hue_rotate_radians as f32,
                    *invert as f32,
                ],
            )
        }
        WgpuNativeRenderPrimitiveKind::BackdropBlur { blur_radius } => {
            // effect0.x = physical-pixel blur radius, read by BACKDROP_BLUR_WGSL.
            ([*blur_radius as f32, 0.0, 0.0, 0.0], [0.0; 4])
        }
        _ => ([0.0; 4], [0.0; 4]),
    }
}

fn gradient_segment_params_from_primitive(primitive: &WgpuNativeRenderPrimitive) -> [f32; 4] {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Gradient {
            start_offset,
            end_offset,
            fill_before_start,
            fill_after_end,
            ..
        } => [
            *start_offset as f32,
            *end_offset as f32,
            if *fill_before_start { 1.0 } else { 0.0 },
            if *fill_after_end { 1.0 } else { 0.0 },
        ],
        _ => [0.0; 4],
    }
}

/// Height/width of the quad, used to express gradient geometry in quad-width
/// units. Falls back to 1.0 (square) for degenerate bounds.
fn gradient_uv_aspect(primitive: &WgpuNativeRenderPrimitive) -> f64 {
    if matches!(
        primitive.kind,
        WgpuNativeRenderPrimitiveKind::Gradient {
            kind: crate::render_graph::GradientDrawKind::Radial,
            radial_shape: crate::render_graph::GradientDrawRadialShape::Ellipse,
            ..
        }
    ) {
        return 1.0;
    }
    let width = primitive.physical_bounds.width as f64;
    let height = primitive.physical_bounds.height as f64;
    if width > 0.0 && height > 0.0 {
        height / width
    } else {
        1.0
    }
}

fn quad_aspect(primitive: &WgpuNativeRenderPrimitive) -> f32 {
    gradient_uv_aspect(primitive) as f32
}

/// Rescales gradient UVs around the quad centre so one unit means the same
/// distance on both axes. Without this a `radial-gradient(circle ...)` renders
/// as an ellipse on any non-square quad, and linear gradient angles are skewed.
fn apply_gradient_aspect_uv(vertices: &mut [WgpuNativeRenderVertex; 4], aspect: f32) {
    if !aspect.is_finite() || aspect <= 0.0 || (aspect - 1.0).abs() <= f32::EPSILON {
        return;
    }
    for vertex in vertices {
        vertex.uv[1] = (vertex.uv[1] - 0.5) * aspect + 0.5;
    }
}

fn apply_triangle_vertices(vertices: &mut [WgpuNativeRenderVertex; 4], points_up: bool) {
    let left = vertices[0].position[0];
    let top = vertices[0].position[1];
    let right = vertices[2].position[0];
    let bottom = vertices[2].position[1];
    let center_x = (left + right) * 0.5;
    let (edge_y, point_y) = if points_up {
        (bottom, top)
    } else {
        (top, bottom)
    };
    vertices[0].position = [left, edge_y];
    vertices[1].position = [right, edge_y];
    vertices[2].position = [center_x, point_y];
    vertices[3] = vertices[2];
}

/// Collapses the quad into a sideways triangle for list-affordance chevrons.
/// The Web build draws these as a rotated 1px corner rule; at the few logical
/// pixels these occupy a solid triangle reads the same and stays one draw.
fn apply_horizontal_triangle_vertices(
    vertices: &mut [WgpuNativeRenderVertex; 4],
    points_right: bool,
) {
    let left = vertices[0].position[0];
    let top = vertices[0].position[1];
    let right = vertices[2].position[0];
    let bottom = vertices[2].position[1];
    let center_y = (top + bottom) * 0.5;
    let (edge_x, point_x) = if points_right {
        (left, right)
    } else {
        (right, left)
    };
    vertices[0].position = [edge_x, top];
    vertices[1].position = [edge_x, bottom];
    vertices[2].position = [point_x, center_y];
    vertices[3] = vertices[2];
}

fn opacity_from_primitive(primitive: &WgpuNativeRenderPrimitive) -> f32 {
    let multiplier = match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::UiButton { enabled: false, .. } => {
            DISABLED_BUTTON_OPACITY_MULTIPLIER
        }
        _ => 1.0,
    };

    (primitive.opacity * multiplier).clamp(0.0, 1.0)
}
