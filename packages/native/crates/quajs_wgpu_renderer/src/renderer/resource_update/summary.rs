use std::collections::BTreeMap;

use super::types::{
    NativeRendererFrameAudioResourceSyncSummary, NativeRendererFrameResourceSyncSummary,
    NativeRendererHostCleanupRecord, NativeRendererPackageReleaseSummary,
};
use crate::resources::{
    is_declarative_asset_kind, AudioResourceSyncPlan, FrameResourceSyncPlan, NativeResourceKind,
    NativeResourceLedger, NativeResourceRecord, PackageUnloadBlockerReason, PackageUnloadPlan,
    ResourceMemory,
};

pub(in crate::renderer) fn frame_resource_sync_summary(
    sync: &FrameResourceSyncPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererFrameResourceSyncSummary {
    let released = released_resource_summary(released_resources);
    let mut summary = NativeRendererFrameResourceSyncSummary {
        upsert_count: sync.upsert.len(),
        retain_count: sync.retain.len(),
        release_count: sync.release.len(),
        released_count: released.count,
        replacement_release_count: replacement_release_count(sync.release.len(), released.count),
        declarative_released_count: released.declarative_count,
        released_memory: released.memory,
        declarative_released_memory: released.declarative_memory,
        released_by_kind: released.by_kind,
        ..Default::default()
    };

    for record in &sync.upsert {
        *summary.upsert_by_kind.entry(record.kind).or_default() += 1;
        if is_declarative_asset_kind(record.kind) {
            summary.declarative_upsert_count = summary.declarative_upsert_count.saturating_add(1);
        }
    }

    summary
}

pub(in crate::renderer) fn frame_audio_resource_sync_summary(
    sync: &AudioResourceSyncPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererFrameAudioResourceSyncSummary {
    let released = released_resource_summary(released_resources);
    let mut summary = NativeRendererFrameAudioResourceSyncSummary {
        upsert_count: sync.upsert.len(),
        retain_count: sync.retain.len(),
        release_count: sync.release.len(),
        released_count: released.count,
        replacement_release_count: replacement_release_count(sync.release.len(), released.count),
        released_memory: released.memory,
        released_by_kind: released.by_kind,
        ..Default::default()
    };

    for record in &sync.upsert {
        *summary.upsert_by_kind.entry(record.kind).or_default() += 1;
    }

    summary
}

pub(in crate::renderer) fn host_cleanup_records(
    released_resources: &[NativeResourceRecord],
) -> Vec<NativeRendererHostCleanupRecord> {
    released_resources
        .iter()
        .map(|record| NativeRendererHostCleanupRecord {
            resource_id: record.id.clone(),
            kind: record.kind,
            declarative_asset: is_declarative_asset_kind(record.kind),
            owner_package_id: record.owner_package_id.clone(),
            required_package_ids: record.required_package_ids.iter().cloned().collect(),
            memory: record.memory,
            label: record.label.clone(),
        })
        .collect()
}

pub(in crate::renderer) fn package_release_summary(
    plan: &PackageUnloadPlan,
    released_resources: &[NativeResourceRecord],
    ledger: &NativeResourceLedger,
) -> NativeRendererPackageReleaseSummary {
    let released = released_resource_summary(released_resources);
    let blocked = blocked_resource_summary(plan, ledger);
    NativeRendererPackageReleaseSummary {
        releasable_count: plan.releasable.len(),
        blocked_count: plan.blocked.len(),
        released_count: released.count,
        declarative_released_count: released.declarative_count,
        declarative_blocked_count: blocked.declarative_count,
        released_memory: released.memory,
        declarative_released_memory: released.declarative_memory,
        blocked_memory: blocked.memory,
        declarative_blocked_memory: blocked.declarative_memory,
        released_by_kind: released.by_kind,
        blocked_by_kind: blocked.by_kind,
        blocked_by_reason: blocked.by_reason,
        blocked_memory_by_kind: blocked.memory_by_kind,
        blocked_memory_by_reason: blocked.memory_by_reason,
    }
}

fn replacement_release_count(planned_release_count: usize, released_count: usize) -> usize {
    released_count.saturating_sub(planned_release_count)
}

#[derive(Clone, Debug, Default)]
struct ReleasedResourceSummary {
    count: usize,
    declarative_count: usize,
    memory: ResourceMemory,
    declarative_memory: ResourceMemory,
    by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, Default)]
struct BlockedResourceSummary {
    declarative_count: usize,
    memory: ResourceMemory,
    declarative_memory: ResourceMemory,
    by_kind: BTreeMap<NativeResourceKind, usize>,
    by_reason: BTreeMap<PackageUnloadBlockerReason, usize>,
    memory_by_kind: BTreeMap<NativeResourceKind, ResourceMemory>,
    memory_by_reason: BTreeMap<PackageUnloadBlockerReason, ResourceMemory>,
}

fn blocked_resource_summary(
    plan: &PackageUnloadPlan,
    ledger: &NativeResourceLedger,
) -> BlockedResourceSummary {
    let mut summary = BlockedResourceSummary::default();
    for blocker in &plan.blocked {
        *summary.by_kind.entry(blocker.kind).or_default() += 1;
        *summary.by_reason.entry(blocker.reason).or_default() += 1;

        let Some(record) = ledger.get(blocker.resource_id.clone()) else {
            continue;
        };
        summary.memory.add_assign(record.memory);
        if is_declarative_asset_kind(record.kind) {
            summary.declarative_count = summary.declarative_count.saturating_add(1);
            summary.declarative_memory.add_assign(record.memory);
        }
        summary
            .memory_by_kind
            .entry(blocker.kind)
            .or_default()
            .add_assign(record.memory);
        summary
            .memory_by_reason
            .entry(blocker.reason)
            .or_default()
            .add_assign(record.memory);
    }
    summary
}

fn released_resource_summary(
    released_resources: &[NativeResourceRecord],
) -> ReleasedResourceSummary {
    let mut summary = ReleasedResourceSummary {
        count: released_resources.len(),
        ..Default::default()
    };

    for record in released_resources {
        *summary.by_kind.entry(record.kind).or_default() += 1;
        summary.memory.add_assign(record.memory);
        if is_declarative_asset_kind(record.kind) {
            summary.declarative_count = summary.declarative_count.saturating_add(1);
            summary.declarative_memory.add_assign(record.memory);
        }
    }

    summary
}
