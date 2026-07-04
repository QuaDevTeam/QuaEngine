use std::collections::BTreeMap;

use crate::frame::PreparedNativeFrame;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, DrawCommandParams};
use crate::resources::is_declarative_asset_kind;

use super::{NativeRendererFrameAssetMetrics, NativeRendererFrameMetrics};

pub(super) fn frame_metrics(frame: &PreparedNativeFrame) -> NativeRendererFrameMetrics {
    NativeRendererFrameMetrics {
        command_count: frame.summary.command_count,
        interactive_count: frame.summary.interactive_count,
        pass_count: frame.passes.passes.len(),
        batch_count: frame.passes.batch_count,
        resource_request_count: frame.resources.requests.len(),
        resource_ref_count: frame.resources.resource_ref_count,
        asset_request_count: frame.assets.requests.len(),
        declarative_asset_request_count: frame_declarative_asset_request_count(frame),
        skipped_asset_resource_count: frame.assets.skipped_resource_ids.len(),
        fallback_count: frame_fallback_count(frame),
        video_fallback_count: frame_video_fallback_count(frame),
        by_plane: frame.summary.by_plane.clone(),
        by_package: frame.summary.by_package.clone(),
        by_resource_kind: frame.resources.by_kind.clone(),
        asset_requests_by_type: frame_asset_type_metrics(frame),
        asset_requests_by_package: frame_asset_package_metrics(frame),
        fallbacks_by_pipeline: frame_fallback_pipeline_metrics(frame),
        fallbacks_by_reason: frame_fallback_reason_metrics(frame),
        fallbacks_by_owner_package: frame_fallback_owner_package_metrics(frame),
        fallbacks_by_required_package: frame_fallback_required_package_metrics(frame),
    }
}

fn frame_declarative_asset_request_count(frame: &PreparedNativeFrame) -> usize {
    frame
        .assets
        .requests
        .iter()
        .filter(|request| is_declarative_asset_kind(request.kind))
        .count()
}

fn frame_asset_type_metrics(
    frame: &PreparedNativeFrame,
) -> BTreeMap<String, NativeRendererFrameAssetMetrics> {
    let mut by_type = BTreeMap::new();

    for request in &frame.assets.requests {
        let summary = by_type
            .entry(request.asset_type.clone())
            .or_insert_with(NativeRendererFrameAssetMetrics::default);
        summary.request_count += 1;
        summary.command_ref_count += request.command_ids.len();
    }

    by_type
}

fn frame_asset_package_metrics(
    frame: &PreparedNativeFrame,
) -> BTreeMap<String, NativeRendererFrameAssetMetrics> {
    let mut by_package = BTreeMap::new();

    for request in &frame.assets.requests {
        for package_id in &request.package_candidates {
            let summary = by_package
                .entry(package_id.clone())
                .or_insert_with(NativeRendererFrameAssetMetrics::default);
            summary.request_count += 1;
            summary.command_ref_count += request.command_ids.len();
        }
    }

    by_package
}

fn frame_fallback_count(frame: &PreparedNativeFrame) -> usize {
    frame
        .graph
        .commands()
        .iter()
        .filter(|command| fallback_reason(&command.params).is_some())
        .count()
}

fn frame_video_fallback_count(frame: &PreparedNativeFrame) -> usize {
    frame
        .graph
        .commands()
        .iter()
        .filter(|command| {
            command.kind == DrawCommandKind::VideoFrame
                && fallback_reason(&command.params).is_some()
        })
        .count()
}

fn frame_fallback_pipeline_metrics(
    frame: &PreparedNativeFrame,
) -> BTreeMap<DrawBatchPipeline, usize> {
    let mut by_pipeline = BTreeMap::new();

    for command in frame.graph.commands() {
        if fallback_reason(&command.params).is_none() {
            continue;
        }

        *by_pipeline
            .entry(fallback_pipeline(&command.params, command.kind))
            .or_default() += 1;
    }

    by_pipeline
}

fn frame_fallback_reason_metrics(frame: &PreparedNativeFrame) -> BTreeMap<String, usize> {
    let mut by_reason = BTreeMap::new();

    for command in frame.graph.commands() {
        let Some(reason) = fallback_reason(&command.params) else {
            continue;
        };

        *by_reason.entry(reason.to_string()).or_default() += 1;
    }

    by_reason
}

fn frame_fallback_owner_package_metrics(frame: &PreparedNativeFrame) -> BTreeMap<String, usize> {
    let mut by_package = BTreeMap::new();

    for command in frame.graph.commands() {
        if fallback_reason(&command.params).is_none() {
            continue;
        }

        if let Some(package_id) = &command.owner_package_id {
            *by_package.entry(package_id.clone()).or_default() += 1;
        }
    }

    by_package
}

fn frame_fallback_required_package_metrics(frame: &PreparedNativeFrame) -> BTreeMap<String, usize> {
    let mut by_package = BTreeMap::new();

    for command in frame.graph.commands() {
        if fallback_reason(&command.params).is_none() {
            continue;
        }

        for package_id in &command.required_package_ids {
            *by_package.entry(package_id.clone()).or_default() += 1;
        }
    }

    by_package
}

fn fallback_reason(params: &DrawCommandParams) -> Option<&str> {
    match params {
        DrawCommandParams::Video(params) => params.fallback_reason.as_deref(),
        _ => None,
    }
}

fn fallback_pipeline(params: &DrawCommandParams, kind: DrawCommandKind) -> DrawBatchPipeline {
    match params {
        DrawCommandParams::Video(_) => DrawBatchPipeline::Video,
        _ => match kind {
            DrawCommandKind::Clear => DrawBatchPipeline::Clear,
            DrawCommandKind::Image | DrawCommandKind::NineSlice => DrawBatchPipeline::Image,
            DrawCommandKind::Text | DrawCommandKind::RichText => DrawBatchPipeline::Text,
            DrawCommandKind::Rect | DrawCommandKind::RoundedRect => DrawBatchPipeline::Shape,
            DrawCommandKind::ClipStart | DrawCommandKind::ClipEnd => DrawBatchPipeline::Clip,
            DrawCommandKind::VideoFrame => DrawBatchPipeline::Video,
            DrawCommandKind::UiSurface => DrawBatchPipeline::Ui,
            DrawCommandKind::Custom => DrawBatchPipeline::Custom,
        },
    }
}
