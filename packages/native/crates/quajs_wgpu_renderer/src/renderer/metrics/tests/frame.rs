use super::*;

#[test]
fn reports_empty_renderer_metrics() {
    let resources = NativeResourceLedger::new();
    let metrics = NativeRendererMetrics::from_state(0, None, &resources);

    assert_eq!(metrics.revision, 0);
    assert!(!metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 0);
    assert_eq!(metrics.resources.ledger_resource_count, 0);
    assert_eq!(metrics.resources.declarative_resource_count, 0);
    assert_eq!(metrics.resources.memory.total_bytes(), 0);
    assert_eq!(metrics.resources.declarative_memory.total_bytes(), 0);
    assert_eq!(metrics.resources.declarative_package_count, 0);
    assert!(metrics.resources.declarative_by_package.is_empty());
    assert_eq!(metrics.resources.audio.resource_count, 0);
    assert_eq!(metrics.resources.audio.memory.total_bytes(), 0);
    assert_eq!(metrics.audio_backend.active_track_count, 0);
    assert!(metrics
        .audio_backend
        .active_track_count_by_package
        .is_empty());
    assert_eq!(metrics.resources.pressure.total_count, 0);
    assert_eq!(metrics.resources.pressure.total_memory.total_bytes(), 0);
}

#[test]
fn reports_frame_metrics_from_prepared_frame() {
    let frame =
        crate::frame::prepare_native_frame(test_layout(), &view_with_background_and_choice());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(3, Some(&frame), &resources);

    assert_eq!(metrics.revision, 3);
    assert!(metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 3);
    assert_eq!(metrics.frame.interactive_count, 1);
    assert_eq!(metrics.frame.pass_count, 2);
    assert_eq!(metrics.frame.batch_count, 3);
    assert_eq!(metrics.frame.resource_request_count, 1);
    assert_eq!(metrics.frame.resource_ref_count, 1);
    assert_eq!(metrics.frame.asset_request_count, 1);
    assert_eq!(metrics.frame.declarative_asset_request_count, 0);
    assert_eq!(metrics.frame.skipped_asset_resource_count, 0);
    assert_eq!(metrics.frame.fallback_count, 0);
    assert_eq!(metrics.frame.video_fallback_count, 0);
    assert!(metrics.frame.fallbacks_by_pipeline.is_empty());
    assert!(metrics.frame.fallbacks_by_reason.is_empty());
    assert!(metrics.frame.fallbacks_by_owner_package.is_empty());
    assert!(metrics.frame.fallbacks_by_required_package.is_empty());
    assert_eq!(metrics.frame.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        metrics.frame.by_plane[&RenderPlane::Scene].resource_ref_count,
        1
    );
    assert_eq!(metrics.frame.by_plane[&RenderPlane::Safe].command_count, 2);
    assert_eq!(
        metrics.frame.by_plane[&RenderPlane::Safe].interactive_count,
        1
    );
}

#[test]
fn reports_video_fallback_metrics_from_prepared_frame() {
    let frame = crate::frame::prepare_native_frame(test_layout(), &view_with_video_fallback());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(6, Some(&frame), &resources);

    assert_eq!(metrics.frame.command_count, 1);
    assert_eq!(metrics.frame.fallback_count, 1);
    assert_eq!(metrics.frame.video_fallback_count, 1);
    assert_eq!(
        metrics.frame.fallbacks_by_pipeline[&DrawBatchPipeline::Video],
        1
    );
    assert_eq!(
        metrics.frame.fallbacks_by_reason["native video decode backend is not active"],
        1
    );
    assert_eq!(metrics.frame.fallbacks_by_owner_package["runtime.video"], 1);
    assert_eq!(metrics.frame.fallbacks_by_required_package["base"], 1);
}

#[test]
fn reports_frame_metrics_by_package_and_resource_kind() {
    let frame = crate::frame::prepare_native_frame(test_layout(), &package_aware_view());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(4, Some(&frame), &resources);

    assert_eq!(metrics.resources.package_count, 0);
    assert_eq!(metrics.frame.by_package["base"].command_count, 4);
    assert_eq!(metrics.frame.by_package["base"].resource_ref_count, 2);
    assert_eq!(metrics.frame.by_package["base"].interactive_count, 2);
    assert_eq!(metrics.frame.by_package["runtime.ui"].command_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.ui"].resource_ref_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.ui"].interactive_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.choice"].command_count, 1);
    assert_eq!(
        metrics.frame.by_package["runtime.choice"].resource_ref_count,
        0
    );
    assert_eq!(
        metrics.frame.by_package["runtime.choice"].interactive_count,
        1
    );
    assert_eq!(
        metrics.frame.by_resource_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(
        metrics.frame.by_resource_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(metrics.frame.declarative_asset_request_count, 1);
    assert_eq!(
        metrics.frame.asset_requests_by_type["images"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["images"].command_ref_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].command_ref_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["base"].request_count,
        2
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["base"].command_ref_count,
        2
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["runtime.ui"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["runtime.ui"].command_ref_count,
        1
    );
    assert!(!metrics
        .frame
        .asset_requests_by_package
        .contains_key("runtime.choice"));
}

#[test]
fn reports_declarative_asset_request_count_for_ui_style_and_tokens() {
    let mut graph = crate::render_graph::RenderGraph::new(test_layout());
    graph.extend([crate::render_graph::DrawCommand::new(
        "ui:surface",
        RenderPlane::Screen,
        crate::render_graph::DrawCommandKind::UiSurface,
        crate::render_graph::LogicalRect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        },
    )
    .resource("surface:ui/menu.qui")
    .resource("qss:themes/default.qss.json")
    .resource("tokens:themes/default.tokens.json")]);
    let resources = crate::resources::plan_render_graph_resources(&graph);
    let assets = crate::resources::plan_asset_requests(&resources);
    let frame = crate::frame::PreparedNativeFrame {
        summary: graph.summary(),
        resources,
        assets,
        passes: crate::render_graph::plan_render_passes(&graph),
        graph,
    };
    let metrics = NativeRendererMetrics::from_state(5, Some(&frame), &NativeResourceLedger::new());

    assert_eq!(metrics.frame.asset_request_count, 3);
    assert_eq!(metrics.frame.declarative_asset_request_count, 3);
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].request_count,
        1
    );
    assert_eq!(metrics.frame.asset_requests_by_type["qss"].request_count, 1);
    assert_eq!(
        metrics.frame.asset_requests_by_type["tokens"].request_count,
        1
    );
}
