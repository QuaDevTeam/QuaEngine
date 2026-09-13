use std::collections::BTreeMap;

use crate::resources::{
    is_declarative_asset_kind, NativeResourceKind, NativeResourceLedger, PackageResourceSummary,
    ResourceMemory,
};

use super::{NativeRendererAudioResourceMetrics, NativeRendererResourceMetrics};

pub(super) fn resource_metrics(resources: &NativeResourceLedger) -> NativeRendererResourceMetrics {
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
