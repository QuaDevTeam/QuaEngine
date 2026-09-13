use crate::input::{PointerIntentResolution, RendererIntentHit};
use crate::render_graph::{RenderGraph, RenderGraphSummary, RenderPassPlan};
use crate::resources::{NativeAssetRequestPlan, RenderResourcePlan};
use crate::stage_layout::{StageClientPoint, StageClientRectOrigin};

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

    pub fn pointer_intent(
        &self,
        point: StageClientPoint,
        container_rect: StageClientRectOrigin,
    ) -> PointerIntentResolution {
        crate::input::resolve_pointer_intent_at(&self.graph, point, container_rect)
    }
}
