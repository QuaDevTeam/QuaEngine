use serde::Serialize;

use quajs_wgpu_renderer::renderer::{NativeRendererFrameResult, NativeRendererMetrics};
use quajs_wgpu_renderer::resources::ResourceMemory;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeSummary {
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub resource_count: usize,
    pub missing_resource_count: usize,
    pub fallback_count: usize,
    pub video_fallback_count: usize,
    pub declarative_asset_request_count: usize,
    pub declarative_resource_count: usize,
    pub audio_resource_count: usize,
    pub active_audio_track_count: usize,
    pub resource_package_count: usize,
    pub resource_kind_count: usize,
    pub memory: NativeRendererSmokeMemorySummary,
    pub declarative_memory: NativeRendererSmokeMemorySummary,
    pub audio_memory: NativeRendererSmokeMemorySummary,
}

impl NativeRendererSmokeSummary {
    pub fn from_frame_result(
        result: &NativeRendererFrameResult,
        metrics: &NativeRendererMetrics,
    ) -> Self {
        Self {
            revision: result.submission.revision,
            pass_count: result.submission.pass_count,
            batch_count: result.submission.batch_count,
            command_count: result.submission.command_count,
            resource_count: result.submission.resource_count,
            missing_resource_count: result.submission.missing_resource_count,
            fallback_count: result.submission.fallback_summary.fallback_count,
            video_fallback_count: result.submission.fallback_summary.video_fallback_count,
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
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeMemorySummary {
    pub cpu_bytes: u64,
    pub gpu_bytes: u64,
    pub total_bytes: u64,
}

impl NativeRendererSmokeMemorySummary {
    fn from_memory(memory: ResourceMemory) -> Self {
        Self {
            cpu_bytes: memory.cpu_bytes,
            gpu_bytes: memory.gpu_bytes,
            total_bytes: memory.total_bytes(),
        }
    }
}
