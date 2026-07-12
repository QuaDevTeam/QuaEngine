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
    pub border: Option<WgpuNativeRenderQuadBorder>,
    pub text_overlay: Option<WgpuNativeRenderTextOverlay>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub resource_ids: Vec<ResourceId>,
}

impl WgpuNativeRenderQuad {
    pub(super) fn from_primitive(primitive: &WgpuNativeRenderPrimitive) -> Self {
        let (paint, corner_radius, border, text_overlay) = paint_from_primitive(primitive);
        let mut geometry = primitive_geometry(primitive);
        if let WgpuNativeRenderPrimitiveKind::Panel { role, .. } = &primitive.kind {
            match role.as_str() {
                "ui-select-chevron-down" => apply_triangle_vertices(&mut geometry.vertices, false),
                "ui-select-chevron-up" => apply_triangle_vertices(&mut geometry.vertices, true),
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
        let (effect0, effect1) = effect_params_from_primitive(primitive);

        Self {
            command_id: primitive.command_id.clone(),
            pipeline: primitive.pipeline,
            draw_kind: primitive.draw_kind,
            physical_bounds: primitive.physical_bounds,
            scissor: geometry.scissor,
            vertices: geometry.vertices,
            indices: QUAD_INDICES,
            paint,
            opacity: opacity_from_primitive(primitive),
            corner_radius,
            effect0,
            effect1,
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
            let end_color = parse_color_literal(end_color)
                .map(|color| color.to_linear_rgba())
                .unwrap_or([0.0; 4]);
            let parameters = match kind {
                crate::render_graph::GradientDrawKind::Linear => {
                    let radians = angle_degrees.to_radians();
                    [radians.sin() as f32, -radians.cos() as f32, 0.0, 4.0]
                }
                crate::render_graph::GradientDrawKind::Radial => [
                    *center_x as f32,
                    *center_y as f32,
                    (*radius as f32).max(0.0001),
                    5.0,
                ],
            };
            (end_color, parameters)
        }
        WgpuNativeRenderPrimitiveKind::Image {
            brightness,
            saturation,
            ..
        } if (*brightness - 1.0).abs() > f64::EPSILON
            || (*saturation - 1.0).abs() > f64::EPSILON =>
        {
            (
                [*brightness as f32, *saturation as f32, 0.0, 0.0],
                [1.0, 0.0, 0.0, 0.0],
            )
        }
        _ => ([0.0; 4], [0.0; 4]),
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

fn opacity_from_primitive(primitive: &WgpuNativeRenderPrimitive) -> f32 {
    let multiplier = match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::UiButton { enabled: false, .. } => {
            DISABLED_BUTTON_OPACITY_MULTIPLIER
        }
        _ => 1.0,
    };

    (primitive.opacity * multiplier).clamp(0.0, 1.0)
}
