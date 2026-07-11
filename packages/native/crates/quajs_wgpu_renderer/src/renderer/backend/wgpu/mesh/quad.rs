use crate::render_graph::{DrawBatchPipeline, DrawCommandKind};
use crate::resources::ResourceId;

use super::super::physical::WgpuPhysicalRect;
use super::super::primitive::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};
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
    pub shadow_blur_radius: f32,
    pub border: Option<WgpuNativeRenderQuadBorder>,
    pub text_overlay: Option<WgpuNativeRenderTextOverlay>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub resource_ids: Vec<ResourceId>,
}

impl WgpuNativeRenderQuad {
    pub(super) fn from_primitive(primitive: &WgpuNativeRenderPrimitive) -> Self {
        let (paint, corner_radius, border, text_overlay) = paint_from_primitive(primitive);
        let geometry = primitive_geometry(primitive);

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
            shadow_blur_radius: shadow_blur_radius_from_primitive(primitive),
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

fn shadow_blur_radius_from_primitive(primitive: &WgpuNativeRenderPrimitive) -> f32 {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Panel {
            shadow_blur_radius, ..
        } => *shadow_blur_radius as f32,
        _ => 0.0,
    }
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
