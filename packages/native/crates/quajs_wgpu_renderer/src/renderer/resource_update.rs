use std::collections::{BTreeMap, BTreeSet};

use crate::resources::{
    AudioResourceSyncPlan, FrameResourceSyncPlan, NativeAssetRequestPlan, NativeResourceKind,
    NativeResourceLedger, NativeResourceRecord, PackageUnloadBlocker, PackageUnloadBlockerReason,
    PackageUnloadPlan, ResourceId, ResourceMemory,
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameUpdate {
    pub revision: u64,
    pub resource_sync: FrameResourceSyncPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub resource_sync_summary: NativeRendererFrameResourceSyncSummary,
    pub audio_resource_sync: AudioResourceSyncPlan,
    pub audio_resource_sync_summary: NativeRendererFrameAudioResourceSyncSummary,
    pub audio_assets: NativeAssetRequestPlan,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameResourceSyncSummary {
    pub upsert_count: usize,
    pub retain_count: usize,
    pub release_count: usize,
    pub released_count: usize,
    pub released_memory: ResourceMemory,
    pub upsert_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameAudioResourceSyncSummary {
    pub upsert_count: usize,
    pub retain_count: usize,
    pub release_count: usize,
    pub released_count: usize,
    pub released_memory: ResourceMemory,
    pub upsert_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererPackageRelease {
    pub revision: u64,
    pub plan: PackageUnloadPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub host_cleanup: Vec<NativeRendererHostCleanupRecord>,
    pub summary: NativeRendererPackageReleaseSummary,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererHostCleanupRecord {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub memory: ResourceMemory,
    pub label: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererPackageReleaseSummary {
    pub releasable_count: usize,
    pub blocked_count: usize,
    pub released_count: usize,
    pub released_memory: ResourceMemory,
    pub blocked_memory: ResourceMemory,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub blocked_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub blocked_by_reason: BTreeMap<PackageUnloadBlockerReason, usize>,
    pub blocked_memory_by_kind: BTreeMap<NativeResourceKind, ResourceMemory>,
    pub blocked_memory_by_reason: BTreeMap<PackageUnloadBlockerReason, ResourceMemory>,
}

#[derive(Clone, Debug, Default)]
struct ReleasedResourceSummary {
    count: usize,
    memory: ResourceMemory,
    by_kind: BTreeMap<NativeResourceKind, usize>,
}

pub(super) fn apply_resource_sync(
    ledger: &mut NativeResourceLedger,
    sync: &FrameResourceSyncPlan,
) -> Vec<NativeResourceRecord> {
    let mut released = Vec::new();

    for id in &sync.release {
        if let Some(record) = ledger.release_resource(id.clone()) {
            released.push(record);
        }
    }

    for record in &sync.upsert {
        ledger.insert(merge_existing_record_metadata(ledger, record.clone()));
    }

    released
}

pub(super) fn apply_audio_resource_sync(
    ledger: &mut NativeResourceLedger,
    sync: &AudioResourceSyncPlan,
) -> Vec<NativeResourceRecord> {
    let mut released = Vec::new();

    for id in &sync.release {
        if let Some(record) = ledger.release_resource(id.clone()) {
            released.push(record);
        }
    }

    for record in &sync.upsert {
        ledger.insert(record.clone());
    }

    released
}

pub(super) fn apply_active_projection_unload_guard(
    plan: &mut PackageUnloadPlan,
    active_ids: &BTreeSet<ResourceId>,
    ledger: &NativeResourceLedger,
) {
    if active_ids.is_empty() || plan.releasable.is_empty() {
        return;
    }

    let mut guarded = Vec::new();
    plan.releasable.retain(|id| {
        let active = active_ids.contains(id);
        if active {
            guarded.push(id.clone());
        }
        !active
    });

    for id in guarded {
        if let Some(record) = ledger.get(id.clone()) {
            plan.blocked.push(PackageUnloadBlocker {
                resource_id: id,
                kind: record.kind,
                owner_package_id: record.owner_package_id.clone(),
                required_package_ids: record.required_package_ids.clone(),
                reason: PackageUnloadBlockerReason::ActiveFrameReference,
            });
        }
    }

    plan.releasable_memory = releasable_memory(&plan.releasable, ledger);
}

pub(super) fn frame_resource_sync_summary(
    sync: &FrameResourceSyncPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererFrameResourceSyncSummary {
    let released = released_resource_summary(released_resources);
    let mut summary = NativeRendererFrameResourceSyncSummary {
        upsert_count: sync.upsert.len(),
        retain_count: sync.retain.len(),
        release_count: sync.release.len(),
        released_count: released.count,
        released_memory: released.memory,
        released_by_kind: released.by_kind,
        ..Default::default()
    };

    for record in &sync.upsert {
        *summary.upsert_by_kind.entry(record.kind).or_default() += 1;
    }

    summary
}

pub(super) fn frame_audio_resource_sync_summary(
    sync: &AudioResourceSyncPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererFrameAudioResourceSyncSummary {
    let released = released_resource_summary(released_resources);
    let mut summary = NativeRendererFrameAudioResourceSyncSummary {
        upsert_count: sync.upsert.len(),
        retain_count: sync.retain.len(),
        release_count: sync.release.len(),
        released_count: released.count,
        released_memory: released.memory,
        released_by_kind: released.by_kind,
        ..Default::default()
    };

    for record in &sync.upsert {
        *summary.upsert_by_kind.entry(record.kind).or_default() += 1;
    }

    summary
}

pub(super) fn host_cleanup_records(
    released_resources: &[NativeResourceRecord],
) -> Vec<NativeRendererHostCleanupRecord> {
    released_resources
        .iter()
        .map(|record| NativeRendererHostCleanupRecord {
            resource_id: record.id.clone(),
            kind: record.kind,
            owner_package_id: record.owner_package_id.clone(),
            required_package_ids: record.required_package_ids.iter().cloned().collect(),
            memory: record.memory,
            label: record.label.clone(),
        })
        .collect()
}

pub(super) fn package_release_summary(
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
        released_memory: released.memory,
        blocked_memory: blocked.memory,
        released_by_kind: released.by_kind,
        blocked_by_kind: blocked.by_kind,
        blocked_by_reason: blocked.by_reason,
        blocked_memory_by_kind: blocked.memory_by_kind,
        blocked_memory_by_reason: blocked.memory_by_reason,
    }
}

fn merge_existing_record_metadata(
    ledger: &NativeResourceLedger,
    mut next: NativeResourceRecord,
) -> NativeResourceRecord {
    if let Some(existing) = ledger.get(next.id.clone()) {
        if existing.kind == next.kind {
            next.memory = existing.memory;
            next.label = existing.label.clone();
        }
    }

    next
}

fn releasable_memory(ids: &[ResourceId], ledger: &NativeResourceLedger) -> ResourceMemory {
    let mut memory = ResourceMemory::default();
    for id in ids {
        if let Some(record) = ledger.get(id.clone()) {
            memory.add_assign(record.memory);
        }
    }
    memory
}

#[derive(Clone, Debug, Default)]
struct BlockedResourceSummary {
    memory: ResourceMemory,
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
    }

    summary
}
