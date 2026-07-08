use crate::projection::view::{
    build_view_render_graph, build_view_render_graph_with_video_frame_resources, ViewProjection,
};
use crate::render_graph::plan_render_passes;
use crate::resources::{plan_asset_requests, plan_render_graph_resources};
use crate::stage_layout::ResolvedStageLayout;
use crate::video::VideoBackendFrameResourceMap;

use super::types::PreparedNativeFrame;

pub fn prepare_native_frame(
    layout: ResolvedStageLayout,
    view: &ViewProjection,
) -> PreparedNativeFrame {
    prepare_native_frame_with_video_frame_resources(
        layout,
        view,
        &VideoBackendFrameResourceMap::new(),
    )
}

pub fn prepare_native_frame_with_video_frame_resources(
    layout: ResolvedStageLayout,
    view: &ViewProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) -> PreparedNativeFrame {
    let graph = if video_frame_resources.is_empty() {
        build_view_render_graph(layout, view)
    } else {
        build_view_render_graph_with_video_frame_resources(layout, view, video_frame_resources)
    };
    let summary = graph.summary();
    let resources = plan_render_graph_resources(&graph);
    let assets = plan_asset_requests(&resources);
    let passes = plan_render_passes(&graph);

    PreparedNativeFrame {
        graph,
        summary,
        resources,
        assets,
        passes,
    }
}
