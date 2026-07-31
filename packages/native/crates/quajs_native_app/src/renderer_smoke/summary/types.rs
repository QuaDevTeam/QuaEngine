use std::collections::BTreeMap;

use serde::Serialize;

use quajs_wgpu_renderer::render_graph::DrawCommandKind;
use quajs_wgpu_renderer::renderer::{
    NativeBackendExecutionReport, NativeRendererFrameResult, NativeRendererMetrics,
};

use super::audio_backend::NativeRendererSmokeAudioBackendSummary;
use super::backend::NativeRendererSmokeBackendSummary;
use super::memory::{
    package_memory_summary, resource_kind_memory_summary, NativeRendererSmokeMemorySummary,
    NativeRendererSmokePackageMemorySummary, NativeRendererSmokeResourceKindMemorySummary,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeSummary {
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub command_graph_signature: String,
    pub command_ids: Vec<String>,
    pub command_kind_counts: BTreeMap<String, usize>,
    pub resource_count: usize,
    pub missing_resource_count: usize,
    pub fallback_count: usize,
    pub video_fallback_count: usize,
    pub fallbacks_by_owner_package: BTreeMap<String, usize>,
    pub fallbacks_by_required_package: BTreeMap<String, usize>,
    pub texture_upload_request_count: usize,
    pub texture_upload_pending_request_count: usize,
    pub texture_upload_resident_resource_count: usize,
    pub texture_upload_orphaned_resident_resource_count: usize,
    pub texture_upload_skipped_resource_count: usize,
    pub texture_upload_non_texture_resource_count: usize,
    pub declarative_asset_request_count: usize,
    pub declarative_resource_count: usize,
    pub audio_resource_count: usize,
    pub active_audio_track_count: usize,
    pub resource_package_count: usize,
    pub resource_kind_count: usize,
    pub memory: NativeRendererSmokeMemorySummary,
    pub declarative_memory: NativeRendererSmokeMemorySummary,
    pub audio_memory: NativeRendererSmokeMemorySummary,
    pub audio_backend: NativeRendererSmokeAudioBackendSummary,
    pub backend: NativeRendererSmokeBackendSummary,
    pub memory_by_kind: BTreeMap<String, NativeRendererSmokeResourceKindMemorySummary>,
    pub memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    pub declarative_memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    pub audio_memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
}

impl NativeRendererSmokeSummary {
    pub fn from_frame_result(
        result: &NativeRendererFrameResult,
        metrics: &NativeRendererMetrics,
        backend_report: Option<&NativeBackendExecutionReport>,
        audio_backend: NativeRendererSmokeAudioBackendSummary,
    ) -> Self {
        Self {
            revision: result.submission.revision,
            pass_count: result.submission.pass_count,
            batch_count: result.submission.batch_count,
            command_count: result.submission.command_count,
            command_graph_signature: command_graph_signature(result),
            command_ids: command_ids(result),
            command_kind_counts: command_kind_counts(result),
            resource_count: result.submission.resource_count,
            missing_resource_count: result.submission.missing_resource_count,
            fallback_count: result.submission.fallback_summary.fallback_count,
            video_fallback_count: result.submission.fallback_summary.video_fallback_count,
            fallbacks_by_owner_package: result.submission.fallback_summary.by_owner_package.clone(),
            fallbacks_by_required_package: result
                .submission
                .fallback_summary
                .by_required_package
                .clone(),
            texture_upload_request_count: result.update.texture_uploads.requests.len(),
            texture_upload_pending_request_count: result.texture_upload_sync.pending_requests.len(),
            texture_upload_resident_resource_count: result
                .texture_upload_sync
                .resident_resource_ids
                .len(),
            texture_upload_orphaned_resident_resource_count: result
                .texture_upload_sync
                .orphaned_resident_resource_ids
                .len(),
            texture_upload_skipped_resource_count: result
                .update
                .texture_uploads
                .skipped_resource_ids
                .len(),
            texture_upload_non_texture_resource_count: result
                .update
                .texture_uploads
                .non_texture_resource_ids
                .len(),
            declarative_asset_request_count: metrics.frame.declarative_asset_request_count,
            declarative_resource_count: metrics.resources.declarative_resource_count,
            audio_resource_count: metrics.resources.audio.resource_count,
            active_audio_track_count: metrics.audio_backend.active_track_count,
            resource_package_count: metrics.resources.package_count,
            resource_kind_count: metrics.resources.kind_count,
            memory: NativeRendererSmokeMemorySummary::from_memory(metrics.resources.memory),
            declarative_memory: NativeRendererSmokeMemorySummary::from_memory(
                metrics.resources.declarative_memory,
            ),
            audio_memory: NativeRendererSmokeMemorySummary::from_memory(
                metrics.resources.audio.memory,
            ),
            audio_backend,
            backend: backend_report
                .map(NativeRendererSmokeBackendSummary::from_execution_report)
                .unwrap_or_default(),
            memory_by_kind: resource_kind_memory_summary(&metrics.resources.by_kind),
            memory_by_package: package_memory_summary(&metrics.resources.by_package),
            declarative_memory_by_package: package_memory_summary(
                &metrics.resources.declarative_by_package,
            ),
            audio_memory_by_package: package_memory_summary(&metrics.resources.audio.by_package),
        }
    }
}

fn command_ids(result: &NativeRendererFrameResult) -> Vec<String> {
    result
        .submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .flat_map(|batch| batch.commands.iter())
        .map(|submission| submission.command.id.clone())
        .collect()
}

fn command_kind_counts(result: &NativeRendererFrameResult) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for kind in result
        .submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .flat_map(|batch| batch.commands.iter())
        .map(|submission| submission.command.kind)
    {
        *counts
            .entry(command_kind_name(kind).to_string())
            .or_insert(0) += 1;
    }
    counts
}

fn command_graph_signature(result: &NativeRendererFrameResult) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for command in result
        .submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .flat_map(|batch| batch.commands.iter())
        .map(|submission| &submission.command)
    {
        for byte in format!("{command:?}\n").as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    format!("fnv1a64:{hash:016x}")
}

fn command_kind_name(kind: DrawCommandKind) -> &'static str {
    match kind {
        DrawCommandKind::Clear => "clear",
        DrawCommandKind::Image => "image",
        DrawCommandKind::NineSlice => "nineSlice",
        DrawCommandKind::Text => "text",
        DrawCommandKind::RichText => "richText",
        DrawCommandKind::Rect => "rect",
        DrawCommandKind::RoundedRect => "roundedRect",
        DrawCommandKind::ClipStart => "clipStart",
        DrawCommandKind::ClipEnd => "clipEnd",
        DrawCommandKind::VideoFrame => "videoFrame",
        DrawCommandKind::UiSurface => "uiSurface",
        DrawCommandKind::BackdropBlur => "backdropBlur",
        DrawCommandKind::Custom => "custom",
    }
}
