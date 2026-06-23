use crate::render_graph::RenderGraph;
use crate::stage_layout::{
    client_point_to_stage_logical, StageClientPoint, StageClientRectOrigin, StageHitTestPoint,
};

use super::{resolve_renderer_intent_at, RendererIntentHit};

#[derive(Clone, Debug, PartialEq)]
pub struct PointerIntentResolution {
    pub point: StageHitTestPoint,
    pub intent: Option<RendererIntentHit>,
}

pub fn resolve_pointer_intent_at(
    graph: &RenderGraph,
    point: StageClientPoint,
    container_rect: StageClientRectOrigin,
) -> PointerIntentResolution {
    let point = client_point_to_stage_logical(&graph.layout, point, container_rect);
    let intent = (point.inside_viewport && point.inside_stage)
        .then(|| resolve_renderer_intent_at(graph, point.x, point.y))
        .flatten();

    PointerIntentResolution { point, intent }
}
