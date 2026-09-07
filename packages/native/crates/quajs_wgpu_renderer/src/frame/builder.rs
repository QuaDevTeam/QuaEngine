use crate::projection::view::ViewProjection;
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
    prepare_native_frame_with_measurement(layout, view, video_frame_resources, &|_, _| None)
}

pub(crate) fn prepare_native_frame_with_measurement(
    layout: ResolvedStageLayout,
    view: &ViewProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
    measure: &crate::projection::dialogue::builder::TextHeightMeasurer<'_>,
) -> PreparedNativeFrame {
    let mut graph = crate::render_graph::RenderGraph::new(layout);
    crate::projection::view::builder::append_view_commands_with_measurement(
        &mut graph,
        view,
        video_frame_resources,
        measure,
    );
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
