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
    pub(super) fn from_primitive_pass(
        pass: &WgpuNativeRenderPrimitivePass,
        dimensions: &std::collections::BTreeMap<String, (u32, u32)>,
    ) -> Self {
        let quads = pass
            .primitives
            .iter()
            .flat_map(|primitive| {
                let size = primitive
                    .resource_ids
                    .iter()
                    .find_map(|id| dimensions.get(id.as_str()).copied());
                let quad = WgpuNativeRenderQuad::from_primitive_with_texture_size(primitive, size);
                if let super::super::primitive::WgpuNativeRenderPrimitiveKind::Image {
                    sampling,
                    ..
                } = &primitive.kind
                {
                    if let (Some(slice), Some(size)) = (sampling.nine_slice, size) {
                        return super::nine_slice::slice_quads(
                            quad,
                            size,
                            (
                                primitive.logical_bounds.width,
                                primitive.logical_bounds.height,
                            ),
                            slice,
                        );
                    }
                }
                vec![quad]
            })
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
