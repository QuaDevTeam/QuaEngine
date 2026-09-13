use std::collections::BTreeMap;

use serde::Serialize;

use quajs_wgpu_renderer::resources::{
    NativeResourceKind, PackageResourceSummary, ResourceKindSummary, ResourceMemory,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeMemorySummary {
    pub cpu_bytes: u64,
    pub gpu_bytes: u64,
    pub total_bytes: u64,
}

impl NativeRendererSmokeMemorySummary {
    pub(super) fn from_memory(memory: ResourceMemory) -> Self {
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

pub(super) fn resource_kind_memory_summary(
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

pub(super) fn package_memory_summary(
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
