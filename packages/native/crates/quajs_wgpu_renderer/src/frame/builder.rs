use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::resources::plan_render_graph_resources;
use crate::stage_layout::ResolvedStageLayout;

use super::types::PreparedNativeFrame;

pub fn prepare_native_frame(
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> PreparedNativeFrame {
    let graph = build_view_render_graph(layout, view);
    let summary = graph.summary();
    let resources = plan_render_graph_resources(&graph);

    PreparedNativeFrame {
        graph,
        summary,
        resources,
    }
}
