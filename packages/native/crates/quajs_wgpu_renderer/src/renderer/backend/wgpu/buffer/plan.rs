use crate::render_graph::RenderPlane;

use super::super::mesh::{WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan};
use super::super::physical::WgpuPhysicalRect;
use super::assembly::{append_border_buffers, append_quad_buffers, append_text_overlay_buffers};
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
    pub passes: Vec<WgpuNativeRenderBufferPass>,
}

impl WgpuNativeRenderBufferPlan {
    pub fn from_mesh_plan(mesh_plan: &WgpuNativeRenderMeshPlan) -> Self {
        let passes = mesh_plan
            .passes
            .iter()
            .map(WgpuNativeRenderBufferPass::from_mesh_pass)
            .collect::<Vec<_>>();
        let vertex_count = passes.iter().map(|pass| pass.vertex_count).sum();
        let index_count = passes.iter().map(|pass| pass.index_count).sum();
        let draw_call_count = passes.iter().map(|pass| pass.draw_call_count).sum();
        let skipped_quad_count = passes.iter().map(|pass| pass.skipped_quads.len()).sum();

        Self {
            revision: mesh_plan.revision,
            pass_count: mesh_plan.pass_count,
            vertex_count,
            index_count,
            draw_call_count,
            skipped_quad_count,
            invalid_paint_count: mesh_plan.invalid_paint_count,
            passes,
        }
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
    fn from_mesh_pass(pass: &WgpuNativeRenderMeshPass) -> Self {
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
            append_quad_buffers(quad, &mut vertices, &mut indices, &mut draw_calls);
            append_border_buffers(quad, &mut vertices, &mut indices, &mut draw_calls);
            append_text_overlay_buffers(quad, &mut vertices, &mut indices, &mut draw_calls);
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
