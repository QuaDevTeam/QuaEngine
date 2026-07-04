use crate::resources::{
    AudioResourceSyncPlan, FrameResourceSyncPlan, NativeResourceLedger, NativeResourceRecord,
};

pub(in crate::renderer) fn apply_resource_sync(
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
        let next = merge_existing_record_metadata(ledger, record.clone());
        release_replaced_resource_if_needed(&mut released, ledger.insert(next.clone()), &next);
    }

    released
}

pub(in crate::renderer) fn apply_audio_resource_sync(
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
        release_replaced_resource_if_needed(&mut released, ledger.insert(record.clone()), record);
    }

    released
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

fn release_replaced_resource_if_needed(
    released: &mut Vec<NativeResourceRecord>,
    previous: Option<NativeResourceRecord>,
    next: &NativeResourceRecord,
) {
    if let Some(previous) = previous.filter(|previous| previous.kind != next.kind) {
        released.push(previous);
    }
}
