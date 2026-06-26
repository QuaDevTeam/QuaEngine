use std::collections::BTreeMap;
use std::time::Duration;

use serde::Serialize;

use crate::resources::{
    is_declarative_asset_kind, NativeResourceKind, NativeResourceLedger, PackageResourceSummary,
    ResourceKindSummary, ResourceLedgerSummary, ResourceMemory,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MemoryLedgerSmokeSummary {
    bench: &'static str,
    resources: usize,
    cpu_bytes: u64,
    gpu_bytes: u64,
    total_bytes: u64,
    pub(super) memory_by_kind: BTreeMap<&'static str, ResourceKindMemorySmokeSummary>,
    pub(super) memory_by_package: BTreeMap<String, PackageMemorySmokeSummary>,
    pub(super) declarative_memory_by_package: BTreeMap<String, PackageMemorySmokeSummary>,
    pub(super) audio_memory_by_package: BTreeMap<String, PackageMemorySmokeSummary>,
    elapsed_ms: f64,
}

impl MemoryLedgerSmokeSummary {
    pub(super) fn from_ledger(
        ledger: &NativeResourceLedger,
        summary: &ResourceLedgerSummary,
        elapsed: Duration,
    ) -> Self {
        Self {
            bench: "native.memory_ledger.summary.smoke",
            resources: summary.total_count,
            cpu_bytes: summary.total_memory.cpu_bytes,
            gpu_bytes: summary.total_memory.gpu_bytes,
            total_bytes: summary.total_memory.total_bytes(),
            memory_by_kind: memory_by_kind_smoke_summary(&summary.by_kind),
            memory_by_package: memory_by_package_smoke_summary(&summary.by_package),
            declarative_memory_by_package: filtered_package_memory_smoke_summary(ledger, |kind| {
                is_declarative_asset_kind(kind)
            }),
            audio_memory_by_package: filtered_package_memory_smoke_summary(ledger, |kind| {
                matches!(
                    kind,
                    NativeResourceKind::AudioBuffer
                        | NativeResourceKind::AudioStream
                        | NativeResourceKind::AudioHandle
                )
            }),
            elapsed_ms: elapsed.as_secs_f64() * 1000.0,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ResourceKindMemorySmokeSummary {
    pub(super) count: usize,
    memory: MemorySmokeSummary,
}

impl ResourceKindMemorySmokeSummary {
    fn from_summary(summary: &ResourceKindSummary) -> Self {
        Self {
            count: summary.count,
            memory: MemorySmokeSummary::from_memory(summary.memory),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PackageMemorySmokeSummary {
    owned_count: usize,
    dependent_count: usize,
    pub(super) owned_memory: MemorySmokeSummary,
    dependent_memory: MemorySmokeSummary,
}

impl PackageMemorySmokeSummary {
    fn from_summary(summary: &PackageResourceSummary) -> Self {
        Self {
            owned_count: summary.owned_count,
            dependent_count: summary.dependent_count,
            owned_memory: MemorySmokeSummary::from_memory(summary.owned_memory),
            dependent_memory: MemorySmokeSummary::from_memory(summary.dependent_memory),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MemorySmokeSummary {
    cpu_bytes: u64,
    gpu_bytes: u64,
    pub(super) total_bytes: u64,
}

impl MemorySmokeSummary {
    fn from_memory(memory: ResourceMemory) -> Self {
        Self {
            cpu_bytes: memory.cpu_bytes,
            gpu_bytes: memory.gpu_bytes,
            total_bytes: memory.total_bytes(),
        }
    }
}

fn memory_by_kind_smoke_summary(
    by_kind: &BTreeMap<NativeResourceKind, ResourceKindSummary>,
) -> BTreeMap<&'static str, ResourceKindMemorySmokeSummary> {
    by_kind
        .iter()
        .map(|(kind, summary)| {
            (
                native_resource_kind_smoke_key(*kind),
                ResourceKindMemorySmokeSummary::from_summary(summary),
            )
        })
        .collect()
}

fn memory_by_package_smoke_summary(
    by_package: &BTreeMap<String, PackageResourceSummary>,
) -> BTreeMap<String, PackageMemorySmokeSummary> {
    by_package
        .iter()
        .map(|(package_id, summary)| {
            (
                package_id.clone(),
                PackageMemorySmokeSummary::from_summary(summary),
            )
        })
        .collect()
}

fn filtered_package_memory_smoke_summary(
    ledger: &NativeResourceLedger,
    include_kind: impl Fn(NativeResourceKind) -> bool,
) -> BTreeMap<String, PackageMemorySmokeSummary> {
    let mut by_package: BTreeMap<String, PackageResourceSummary> = BTreeMap::new();

    for record in ledger.records().filter(|record| include_kind(record.kind)) {
        if let Some(owner_package_id) = &record.owner_package_id {
            let package = package_memory_entry(&mut by_package, owner_package_id);
            package.owned_count += 1;
            package.owned_memory.add_assign(record.memory);
        }

        for required_package_id in &record.required_package_ids {
            let package = package_memory_entry(&mut by_package, required_package_id);
            package.dependent_count += 1;
            package.dependent_memory.add_assign(record.memory);
        }
    }

    memory_by_package_smoke_summary(&by_package)
}

fn package_memory_entry<'a>(
    by_package: &'a mut BTreeMap<String, PackageResourceSummary>,
    package_id: &str,
) -> &'a mut PackageResourceSummary {
    by_package
        .entry(package_id.to_string())
        .or_insert_with(|| PackageResourceSummary {
            package_id: package_id.to_string(),
            ..Default::default()
        })
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
