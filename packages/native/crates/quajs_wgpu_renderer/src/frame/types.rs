use crate::input::RendererIntentHit;
use crate::render_graph::{RenderGraph, RenderGraphSummary, RenderPassPlan};
use crate::resources::{NativeAssetRequestPlan, RenderResourcePlan};

#[derive(Clone, Debug, PartialEq)]
pub struct PreparedNativeFrame {
    pub graph: RenderGraph,
    pub summary: RenderGraphSummary,
    pub resources: RenderResourcePlan,
    pub assets: NativeAssetRequestPlan,
    pub passes: RenderPassPlan,
}

impl PreparedNativeFrame {
    pub fn hit_intent(&self, logical_x: f64, logical_y: f64) -> Option<RendererIntentHit> {
        crate::input::resolve_renderer_intent_at(&self.graph, logical_x, logical_y)
    }
}
