use super::*;
use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, LogicalRect, MediaFit, MediaOrigin,
    RenderGraph, RenderPlane, VideoDrawParams,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn collects_fallback_diagnostics_from_video_commands() {
    let diagnostics = collect_fallback_diagnostics(&graph_with_video_fallback());

    assert_eq!(
        diagnostics,
        vec![NativeRenderFallbackDiagnostic {
            command_id: "video".to_string(),
            plane: RenderPlane::Scene,
            pipeline: DrawBatchPipeline::Video,
            kind: DrawCommandKind::VideoFrame,
            reason: "native video decode backend is not active".to_string(),
            owner_package_id: Some("runtime.video".to_string()),
            required_package_ids: ["base"].into_iter().map(ToString::to_string).collect(),
        }]
    );
}

#[test]
fn summarizes_fallback_diagnostics_by_pipeline_and_reason() {
    let diagnostics = collect_fallback_diagnostics(&graph_with_video_fallback());

    let summary = summarize_fallback_diagnostics(&diagnostics);

    assert_eq!(summary.fallback_count, 1);
    assert_eq!(summary.video_fallback_count, 1);
    assert_eq!(summary.by_pipeline[&DrawBatchPipeline::Video], 1);
    assert_eq!(
        summary.by_reason["native video decode backend is not active"],
        1
    );
    assert_eq!(summary.by_owner_package["runtime.video"], 1);
    assert_eq!(summary.by_required_package["base"], 1);
}

#[test]
fn fallback_warning_tracker_reports_each_fallback_once() {
    let diagnostics = collect_fallback_diagnostics(&graph_with_video_fallback());
    let mut tracker = NativeRenderFallbackWarningTracker::default();

    tracker.record_submission(&diagnostics);
    let first = tracker.diagnostics();
    tracker.record_submission(&diagnostics);
    let second = tracker.diagnostics();

    assert_eq!(first.warning_count, 1);
    assert_eq!(first.last_warnings, diagnostics);
    assert_eq!(second.warning_count, 1);
    assert!(second.last_warnings.is_empty());
}

fn graph_with_video_fallback() -> RenderGraph {
    let mut graph = RenderGraph::new(resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    ));
    graph.push(
        DrawCommand::new(
            "video",
            RenderPlane::Scene,
            DrawCommandKind::VideoFrame,
            rect(),
        )
        .params(DrawCommandParams::Video(VideoDrawParams {
            asset_type: "video".to_string(),
            asset_name: "opening.mp4".to_string(),
            frame_resource_id: None,
            poster_asset_name: Some("poster.png".to_string()),
            looped: Some(true),
            muted: Some(true),
            volume: Some(0.5),
            playback_rate: Some(1.25),
            seek_ms: Some(1_200.0),
            offset_ms: Some(50.0),
            fit: MediaFit::Cover,
            origin: MediaOrigin::default(),
            source: rect(),
            fallback_reason: Some("native video decode backend is not active".to_string()),
        }))
        .owned_by("runtime.video")
        .require_package("base"),
    );
    graph
}

fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    }
}
