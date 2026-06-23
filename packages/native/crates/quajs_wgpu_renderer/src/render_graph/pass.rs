use crate::stage_layout::ResolvedStageLayout;

use super::batch::{plan_draw_batches, DrawBatch};
use super::command::RenderPlane;
use super::graph::RenderGraph;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderViewport {
    pub logical_width: f64,
    pub logical_height: f64,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub physical_viewport_width: f64,
    pub physical_viewport_height: f64,
    pub scale: f64,
    pub physical_scale: f64,
    pub device_pixel_ratio: f64,
}

impl RenderViewport {
    pub fn from_layout(layout: &ResolvedStageLayout) -> Self {
        Self {
            logical_width: layout.logical_width,
            logical_height: layout.logical_height,
            viewport_x: layout.viewport_x,
            viewport_y: layout.viewport_y,
            viewport_width: layout.viewport_width,
            viewport_height: layout.viewport_height,
            physical_viewport_width: layout.physical_viewport_width,
            physical_viewport_height: layout.physical_viewport_height,
            scale: layout.scale,
            physical_scale: layout.physical_scale,
            device_pixel_ratio: layout.device_pixel_ratio,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderPass {
    pub plane: RenderPlane,
    pub viewport: RenderViewport,
    pub batches: Vec<DrawBatch>,
    pub command_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RenderPassPlan {
    pub passes: Vec<RenderPass>,
    pub batch_count: usize,
    pub command_count: usize,
}

impl RenderPassPlan {
    pub fn pass(&self, plane: RenderPlane) -> Option<&RenderPass> {
        self.passes.iter().find(|pass| pass.plane == plane)
    }
}

pub fn plan_render_passes(graph: &RenderGraph) -> RenderPassPlan {
    let batches = plan_draw_batches(graph);
    let viewport = RenderViewport::from_layout(&graph.layout);
    let mut plan = RenderPassPlan::default();

    for plane in RenderPlane::ORDERED {
        let plane_batches = batches
            .iter()
            .filter(|batch| batch.key.plane == plane)
            .cloned()
            .collect::<Vec<_>>();

        if plane_batches.is_empty() {
            continue;
        }

        let command_count = plane_batches.iter().map(DrawBatch::command_count).sum();
        plan.batch_count += plane_batches.len();
        plan.command_count += command_count;
        plan.passes.push(RenderPass {
            plane,
            viewport,
            batches: plane_batches,
            command_count,
        });
    }

    plan
}

#[cfg(test)]
mod tests;
