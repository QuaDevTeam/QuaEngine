use std::collections::BTreeMap;

use serde::Serialize;

use quajs_wgpu_renderer::renderer::{NativeRendererFrameResult, NativeRendererMetrics};
use quajs_wgpu_renderer::resources::{
    NativeResourceKind, PackageResourceSummary, ResourceKindSummary, ResourceMemory,
};

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
    pub memory_by_kind: BTreeMap<String, NativeRendererSmokeResourceKindMemorySummary>,
    pub memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    pub declarative_memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    pub audio_memory_by_package: BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
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
            memory_by_kind: resource_kind_memory_summary(&metrics.resources.by_kind),
            memory_by_package: package_memory_summary(&metrics.resources.by_package),
            declarative_memory_by_package: package_memory_summary(
                &metrics.resources.declarative_by_package,
            ),
            audio_memory_by_package: package_memory_summary(&metrics.resources.audio.by_package),
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeResourceKindMemorySummary {
    pub count: usize,
    pub memory: NativeRendererSmokeMemorySummary,
}

impl NativeRendererSmokeResourceKindMemorySummary {
    fn from_summary(summary: &ResourceKindSummary) -> Self {
        Self {
            count: summary.count,
            memory: NativeRendererSmokeMemorySummary::from_memory(summary.memory),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokePackageMemorySummary {
    pub owned_count: usize,
    pub dependent_count: usize,
    pub owned_memory: NativeRendererSmokeMemorySummary,
    pub dependent_memory: NativeRendererSmokeMemorySummary,
}

impl NativeRendererSmokePackageMemorySummary {
    fn from_summary(summary: &PackageResourceSummary) -> Self {
        Self {
            owned_count: summary.owned_count,
            dependent_count: summary.dependent_count,
            owned_memory: NativeRendererSmokeMemorySummary::from_memory(summary.owned_memory),
            dependent_memory: NativeRendererSmokeMemorySummary::from_memory(
                summary.dependent_memory,
            ),
        }
    }
}

fn resource_kind_memory_summary(
    by_kind: &BTreeMap<NativeResourceKind, ResourceKindSummary>,
) -> BTreeMap<String, NativeRendererSmokeResourceKindMemorySummary> {
    by_kind
        .iter()
        .map(|(kind, summary)| {
            (
                native_resource_kind_smoke_key(*kind).to_string(),
                NativeRendererSmokeResourceKindMemorySummary::from_summary(summary),
            )
        })
        .collect()
}

fn package_memory_summary(
    by_package: &BTreeMap<String, PackageResourceSummary>,
) -> BTreeMap<String, NativeRendererSmokePackageMemorySummary> {
    by_package
        .iter()
        .map(|(package_id, summary)| {
            (
                package_id.clone(),
                NativeRendererSmokePackageMemorySummary::from_summary(summary),
            )
        })
        .collect()
}

fn native_resource_kind_smoke_key(kind: NativeResourceKind) -> &'static str {
    match kind {
        NativeResourceKind::Texture => "texture",
        NativeResourceKind::Buffer => "buffer",
        NativeResourceKind::GlyphAtlas => "glyphAtlas",
        NativeResourceKind::FontFace => "fontFace",
        NativeResourceKind::DecodedImage => "decodedImage",
        NativeResourceKind::VideoDecoder => "videoDecoder",
        NativeResourceKind::VideoFrameQueue => "videoFrameQueue",
        NativeResourceKind::VideoTextureRing => "videoTextureRing",
        NativeResourceKind::AudioBuffer => "audioBuffer",
        NativeResourceKind::AudioStream => "audioStream",
        NativeResourceKind::AudioHandle => "audioHandle",
        NativeResourceKind::UiAst => "uiAst",
        NativeResourceKind::QssStyle => "qssStyle",
        NativeResourceKind::TokenTable => "tokenTable",
        NativeResourceKind::RenderGraph => "renderGraph",
        NativeResourceKind::Other => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_resource_kind_and_package_memory_maps() {
        let by_kind = BTreeMap::from([
            (
                NativeResourceKind::UiAst,
                ResourceKindSummary {
                    count: 2,
                    memory: ResourceMemory {
                        cpu_bytes: 256,
                        gpu_bytes: 0,
                    },
                },
            ),
            (
                NativeResourceKind::AudioBuffer,
                ResourceKindSummary {
                    count: 1,
                    memory: ResourceMemory {
                        cpu_bytes: 512,
                        gpu_bytes: 0,
                    },
                },
            ),
        ]);
        let by_package = BTreeMap::from([(
            "runtime.ui".to_string(),
            PackageResourceSummary {
                package_id: "runtime.ui".to_string(),
                owned_count: 2,
                dependent_count: 1,
                owned_memory: ResourceMemory {
                    cpu_bytes: 256,
                    gpu_bytes: 0,
                },
                dependent_memory: ResourceMemory {
                    cpu_bytes: 64,
                    gpu_bytes: 128,
                },
            },
        )]);

        let summary = resource_kind_memory_summary(&by_kind);
        assert_eq!(summary["uiAst"].count, 2);
        assert_eq!(summary["uiAst"].memory.total_bytes, 256);
        assert_eq!(summary["audioBuffer"].memory.cpu_bytes, 512);

        let packages = package_memory_summary(&by_package);
        assert_eq!(packages["runtime.ui"].owned_count, 2);
        assert_eq!(packages["runtime.ui"].dependent_count, 1);
        assert_eq!(packages["runtime.ui"].dependent_memory.total_bytes, 192);
    }
}
