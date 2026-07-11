use crate::fonts::FontBackendAtlasLayoutMap;
use crate::render_graph::RenderPlane;

use super::super::mesh::{WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan};
use super::super::physical::WgpuPhysicalRect;
use super::assembly::{append_border_buffers, append_quad_buffers, append_text_overlay_buffers};
use super::text_geometry::atlas_text_is_shaped;
use super::types::{
    WgpuNativeRenderBufferVertex, WgpuNativeRenderDrawCall, WgpuNativeRenderSkippedQuad,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderBufferPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub vertex_count: usize,
    pub index_count: usize,
    pub draw_call_count: usize,
    pub skipped_quad_count: usize,
    pub invalid_paint_count: usize,
    pub shaped_text_draw_count: usize,
    pub passes: Vec<WgpuNativeRenderBufferPass>,
}

impl WgpuNativeRenderBufferPlan {
    pub fn from_mesh_plan(mesh_plan: &WgpuNativeRenderMeshPlan) -> Self {
        Self::from_mesh_plan_with_font_atlases(mesh_plan, &FontBackendAtlasLayoutMap::new())
    }

    pub fn from_mesh_plan_with_font_atlases(
        mesh_plan: &WgpuNativeRenderMeshPlan,
        font_atlases: &FontBackendAtlasLayoutMap,
    ) -> Self {
        let passes = mesh_plan
            .passes
            .iter()
            .map(|pass| WgpuNativeRenderBufferPass::from_mesh_pass(pass, font_atlases))
            .collect::<Vec<_>>();
        let vertex_count = passes.iter().map(|pass| pass.vertex_count).sum();
        let index_count = passes.iter().map(|pass| pass.index_count).sum();
        let draw_call_count = passes.iter().map(|pass| pass.draw_call_count).sum();
        let skipped_quad_count = passes.iter().map(|pass| pass.skipped_quads.len()).sum();
        let shaped_text_draw_count = passes
            .iter()
            .flat_map(|pass| pass.draw_calls.iter())
            .filter(|draw| match &draw.paint {
                super::super::mesh::WgpuNativeRenderPaint::TextPlaceholder {
                    text, style, ..
                } => atlas_text_is_shaped(text, style, font_atlases),
                _ => false,
            })
            .count();

        Self {
            revision: mesh_plan.revision,
            pass_count: mesh_plan.pass_count,
            vertex_count,
            index_count,
            draw_call_count,
            skipped_quad_count,
            invalid_paint_count: mesh_plan.invalid_paint_count,
            shaped_text_draw_count,
            passes,
        }
    }

    pub fn font_atlas_text_draw_count(&self) -> usize {
        self.text_draw_calls()
            .filter(|draw| {
                draw.resource_ids
                    .iter()
                    .any(|resource_id| resource_id.as_str().starts_with("fonts:"))
            })
            .count()
    }

    pub fn bitmap_text_draw_count(&self) -> usize {
        self.text_draw_calls()
            .filter(|draw| draw.resource_ids.is_empty())
            .count()
    }

    pub fn font_atlas_resource_ids(&self) -> Vec<String> {
        let mut resource_ids = self
            .text_draw_calls()
            .flat_map(|draw| draw.resource_ids.iter())
            .filter(|resource_id| resource_id.as_str().starts_with("fonts:"))
            .map(|resource_id| resource_id.as_str().to_string())
            .collect::<Vec<_>>();
        resource_ids.sort();
        resource_ids.dedup();
        resource_ids
    }

    fn text_draw_calls(&self) -> impl Iterator<Item = &WgpuNativeRenderDrawCall> {
        self.passes
            .iter()
            .flat_map(|pass| pass.draw_calls.iter())
            .filter(|draw| {
                matches!(
                    draw.paint,
                    super::super::mesh::WgpuNativeRenderPaint::TextPlaceholder { .. }
                )
            })
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderBufferPass {
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub vertex_count: usize,
    pub index_count: usize,
    pub draw_call_count: usize,
    pub vertices: Vec<WgpuNativeRenderBufferVertex>,
    pub indices: Vec<u32>,
    pub draw_calls: Vec<WgpuNativeRenderDrawCall>,
    pub skipped_quads: Vec<WgpuNativeRenderSkippedQuad>,
}

impl WgpuNativeRenderBufferPass {
    fn from_mesh_pass(
        pass: &WgpuNativeRenderMeshPass,
        font_atlases: &FontBackendAtlasLayoutMap,
    ) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut draw_calls = Vec::new();
        let mut skipped_quads = Vec::new();

        for quad in &pass.quads {
            if !quad.is_visible() {
                skipped_quads.push(WgpuNativeRenderSkippedQuad::from_quad(quad));
                continue;
            }

            let draw_call_count_before = draw_calls.len();
            append_quad_buffers(
                quad,
                font_atlases,
                &mut vertices,
                &mut indices,
                &mut draw_calls,
            );
            append_border_buffers(
                quad,
                font_atlases,
                &mut vertices,
                &mut indices,
                &mut draw_calls,
            );
            append_text_overlay_buffers(
                quad,
                font_atlases,
                &mut vertices,
                &mut indices,
                &mut draw_calls,
            );
            if draw_calls.len() == draw_call_count_before {
                skipped_quads.push(WgpuNativeRenderSkippedQuad::from_quad(quad));
            }
        }

        Self {
            pass_index: pass.pass_index,
            plane: Some(pass.plane),
            viewport: pass.viewport,
            vertex_count: vertices.len(),
            index_count: indices.len(),
            draw_call_count: draw_calls.len(),
            vertices,
            indices,
            draw_calls,
            skipped_quads,
        }
    }
}
