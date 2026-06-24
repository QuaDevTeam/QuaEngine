use std::collections::BTreeMap;

use crate::audio::AudioBackendTrackStateMap;
use crate::frame::PreparedNativeFrame;
use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, DrawCommandParams, RenderGraphPackageSummary, RenderPlane,
    RenderPlaneSummary,
};
use crate::resources::{
    is_declarative_asset_kind, NativeResourceKind, NativeResourceLedger, PackageResourceSummary,
    ResourceKindSummary, ResourceMemory, ResourceMemoryPressureSummary,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererMetrics {
    pub revision: u64,
    pub has_frame: bool,
    pub frame: NativeRendererFrameMetrics,
    pub resources: NativeRendererResourceMetrics,
    pub audio_backend: NativeRendererAudioBackendMetrics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameMetrics {
    pub command_count: usize,
    pub interactive_count: usize,
    pub pass_count: usize,
    pub batch_count: usize,
    pub resource_request_count: usize,
    pub resource_ref_count: usize,
    pub asset_request_count: usize,
    pub declarative_asset_request_count: usize,
    pub skipped_asset_resource_count: usize,
    pub fallback_count: usize,
    pub video_fallback_count: usize,
    pub by_plane: BTreeMap<RenderPlane, RenderPlaneSummary>,
    pub by_package: BTreeMap<String, RenderGraphPackageSummary>,
    pub by_resource_kind: BTreeMap<NativeResourceKind, usize>,
    pub asset_requests_by_type: BTreeMap<String, NativeRendererFrameAssetMetrics>,
    pub asset_requests_by_package: BTreeMap<String, NativeRendererFrameAssetMetrics>,
    pub fallbacks_by_pipeline: BTreeMap<DrawBatchPipeline, usize>,
    pub fallbacks_by_reason: BTreeMap<String, usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameAssetMetrics {
    pub request_count: usize,
    pub command_ref_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererResourceMetrics {
    pub ledger_resource_count: usize,
    pub declarative_resource_count: usize,
    pub memory: ResourceMemory,
    pub declarative_memory: ResourceMemory,
    pub declarative_package_count: usize,
    pub audio: NativeRendererAudioResourceMetrics,
    pub pressure: ResourceMemoryPressureSummary,
    pub package_count: usize,
    pub kind_count: usize,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceKindSummary>,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
    pub declarative_by_package: BTreeMap<String, PackageResourceSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererAudioResourceMetrics {
    pub resource_count: usize,
    pub buffer_count: usize,
    pub stream_count: usize,
    pub handle_count: usize,
    pub memory: ResourceMemory,
    pub package_count: usize,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererAudioBackendMetrics {
    pub active_track_count: usize,
    pub active_track_count_by_package: BTreeMap<String, usize>,
}

impl NativeRendererMetrics {
    pub fn from_state(
        revision: u64,
        frame: Option<&PreparedNativeFrame>,
        resources: &NativeResourceLedger,
    ) -> Self {
        Self::from_state_with_audio_backend(
            revision,
            frame,
            resources,
            &AudioBackendTrackStateMap::new(),
        )
    }

    pub fn from_state_with_audio_backend(
        revision: u64,
        frame: Option<&PreparedNativeFrame>,
        resources: &NativeResourceLedger,
        audio_backend_tracks: &AudioBackendTrackStateMap,
    ) -> Self {
        Self {
            revision,
            has_frame: frame.is_some(),
            frame: frame.map(frame_metrics).unwrap_or_default(),
            resources: resource_metrics(resources),
            audio_backend: audio_backend_metrics(audio_backend_tracks),
        }
    }
}

fn frame_metrics(frame: &PreparedNativeFrame) -> NativeRendererFrameMetrics {
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

fn resource_metrics(resources: &NativeResourceLedger) -> NativeRendererResourceMetrics {
    let summary = resources.summary();
    let declarative = declarative_resource_metrics(resources);

    NativeRendererResourceMetrics {
        ledger_resource_count: summary.total_count,
        declarative_resource_count: declarative.resource_count,
        memory: summary.total_memory,
        declarative_memory: declarative.memory,
        declarative_package_count: declarative.by_package.len(),
        audio: audio_resource_metrics(resources),
        pressure: summary.memory_pressure(),
        package_count: summary.by_package.len(),
        kind_count: summary.by_kind.len(),
        by_kind: summary.by_kind,
        by_package: summary.by_package,
        declarative_by_package: declarative.by_package,
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct DeclarativeResourceMetrics {
    resource_count: usize,
    memory: ResourceMemory,
    by_package: BTreeMap<String, PackageResourceSummary>,
}

fn declarative_resource_metrics(resources: &NativeResourceLedger) -> DeclarativeResourceMetrics {
    let mut metrics = DeclarativeResourceMetrics::default();

    for record in resources.records() {
        if !is_declarative_asset_kind(record.kind) {
            continue;
        }

        metrics.resource_count += 1;
        metrics.memory.add_assign(record.memory);

        if let Some(owner_package_id) = &record.owner_package_id {
            let package = resource_package_summary_entry(&mut metrics.by_package, owner_package_id);
            package.owned_count += 1;
            package.owned_memory.add_assign(record.memory);
        }

        for required_package_id in &record.required_package_ids {
            let package =
                resource_package_summary_entry(&mut metrics.by_package, required_package_id);
            package.dependent_count += 1;
            package.dependent_memory.add_assign(record.memory);
        }
    }

    metrics
}

fn audio_resource_metrics(resources: &NativeResourceLedger) -> NativeRendererAudioResourceMetrics {
    let mut metrics = NativeRendererAudioResourceMetrics::default();

    for record in resources.records() {
        if !is_audio_resource_kind(record.kind) {
            continue;
        }

        metrics.resource_count += 1;
        metrics.memory.add_assign(record.memory);
        match record.kind {
            NativeResourceKind::AudioBuffer => metrics.buffer_count += 1,
            NativeResourceKind::AudioStream => metrics.stream_count += 1,
            NativeResourceKind::AudioHandle => metrics.handle_count += 1,
            _ => {}
        }

        if let Some(owner_package_id) = &record.owner_package_id {
            let package = resource_package_summary_entry(&mut metrics.by_package, owner_package_id);
            package.owned_count += 1;
            package.owned_memory.add_assign(record.memory);
        }

        for required_package_id in &record.required_package_ids {
            let package =
                resource_package_summary_entry(&mut metrics.by_package, required_package_id);
            package.dependent_count += 1;
            package.dependent_memory.add_assign(record.memory);
        }
    }

    metrics.package_count = metrics.by_package.len();
    metrics
}

fn audio_backend_metrics(tracks: &AudioBackendTrackStateMap) -> NativeRendererAudioBackendMetrics {
    let mut metrics = NativeRendererAudioBackendMetrics {
        active_track_count: tracks.len(),
        ..Default::default()
    };

    for track in tracks.values() {
        for package_id in &track.package_candidates {
            *metrics
                .active_track_count_by_package
                .entry(package_id.clone())
                .or_default() += 1;
        }
    }

    metrics
}

fn resource_package_summary_entry<'a>(
    packages: &'a mut BTreeMap<String, PackageResourceSummary>,
    package_id: &str,
) -> &'a mut PackageResourceSummary {
    packages
        .entry(package_id.to_string())
        .or_insert_with(|| PackageResourceSummary {
            package_id: package_id.to_string(),
            ..Default::default()
        })
}

fn is_audio_resource_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::AudioBuffer
            | NativeResourceKind::AudioStream
            | NativeResourceKind::AudioHandle
    )
}

#[cfg(test)]
mod tests;
