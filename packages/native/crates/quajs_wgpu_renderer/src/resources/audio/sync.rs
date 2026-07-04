use std::collections::BTreeSet;

use crate::projection::audio::AudioProjection;

use super::super::ledger::NativeResourceLedger;
use super::super::record::{NativeResourceRecord, ResourceId, ResourceMemory};
use super::records::{audio_resource_records, is_audio_resource_kind};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AudioResourceSyncPlan {
    pub upsert: Vec<NativeResourceRecord>,
    pub retain: Vec<ResourceId>,
    pub release: Vec<ResourceId>,
}

impl AudioResourceSyncPlan {
    pub fn is_empty(&self) -> bool {
        self.upsert.is_empty() && self.retain.is_empty() && self.release.is_empty()
    }
}

pub fn plan_audio_resource_sync(
    ledger: &NativeResourceLedger,
    audio: Option<&AudioProjection>,
) -> AudioResourceSyncPlan {
    let requested = audio_resource_records(audio);
    let requested_ids = requested
        .iter()
        .map(|record| record.id.clone())
        .collect::<BTreeSet<_>>();
    let mut plan = AudioResourceSyncPlan::default();

    for record in requested {
        match ledger.get(record.id.clone()) {
            Some(existing) if audio_record_metadata_matches(existing, &record) => {
                plan.retain.push(record.id);
            }
            _ => plan
                .upsert
                .push(merge_existing_audio_record(ledger, record)),
        }
    }

    for record in ledger.records() {
        if is_audio_resource_kind(record.kind) && !requested_ids.contains(&record.id) {
            plan.release.push(record.id.clone());
        }
    }

    plan
}

fn audio_record_metadata_matches(
    existing: &NativeResourceRecord,
    next: &NativeResourceRecord,
) -> bool {
    existing.kind == next.kind
        && existing.owner_package_id == next.owner_package_id
        && existing.required_package_ids == next.required_package_ids
        && existing.memory == next.memory
        && existing.label == next.label
}

fn merge_existing_audio_record(
    ledger: &NativeResourceLedger,
    mut next: NativeResourceRecord,
) -> NativeResourceRecord {
    if let Some(existing) = ledger.get(next.id.clone()) {
        if existing.kind == next.kind
            && existing.owner_package_id == next.owner_package_id
            && existing.required_package_ids == next.required_package_ids
        {
            if is_zero_memory(next.memory) {
                next.memory = existing.memory;
            }
            if next.label.is_none() {
                next.label = existing.label.clone();
            }
        }
    }

    next
}

fn is_zero_memory(memory: ResourceMemory) -> bool {
    memory.cpu_bytes == 0 && memory.gpu_bytes == 0
}
