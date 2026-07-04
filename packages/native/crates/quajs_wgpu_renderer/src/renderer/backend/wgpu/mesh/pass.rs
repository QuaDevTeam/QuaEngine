use crate::render_graph::RenderPlane;

use super::super::physical::WgpuPhysicalRect;
use super::super::primitive::WgpuNativeRenderPrimitivePass;
use super::paint::WgpuNativeRenderPaint;
use super::quad::WgpuNativeRenderQuad;

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderMeshPass {
    pub pass_index: usize,
    pub plane: RenderPlane,
    pub viewport: WgpuPhysicalRect,
    pub quad_count: usize,
    pub visible_quad_count: usize,
    pub skipped_quad_count: usize,
    pub invalid_paint_count: usize,
    pub quads: Vec<WgpuNativeRenderQuad>,
}

impl WgpuNativeRenderMeshPass {
    pub(super) fn from_primitive_pass(pass: &WgpuNativeRenderPrimitivePass) -> Self {
        let quads = pass
            .primitives
            .iter()
            .map(WgpuNativeRenderQuad::from_primitive)
            .collect::<Vec<_>>();
        let quad_count = quads.len();
        let visible_quad_count = quads.iter().filter(|quad| quad.is_visible()).count();
        let skipped_quad_count = quads
            .iter()
            .filter(|quad| matches!(quad.paint, WgpuNativeRenderPaint::Skipped { .. }))
            .count();
        let invalid_paint_count = quads
            .iter()
            .filter(|quad| quad.paint.has_invalid_color())
            .count();

        Self {
            pass_index: pass.pass_index,
            plane: pass.plane,
            viewport: pass.viewport,
            quad_count,
            visible_quad_count,
            skipped_quad_count,
            invalid_paint_count,
            quads,
        }
    }
}
