use std::collections::BTreeSet;

use crate::projection::fonts::FontsProjection;

use super::super::ledger::NativeResourceLedger;
use super::super::record::{NativeResourceRecord, ResourceId};
use super::records::{font_resource_records, is_font_projection_resource_record};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FontResourceSyncPlan {
    pub upsert: Vec<NativeResourceRecord>,
    pub retain: Vec<ResourceId>,
    pub release: Vec<ResourceId>,
}

impl FontResourceSyncPlan {
    pub fn is_empty(&self) -> bool {
        self.upsert.is_empty() && self.retain.is_empty() && self.release.is_empty()
    }
}

pub fn plan_font_resource_sync(
    ledger: &NativeResourceLedger,
    fonts: Option<&FontsProjection>,
) -> FontResourceSyncPlan {
    let requested = font_resource_records(fonts);
    let requested_ids = requested
        .iter()
        .map(|record| record.id.clone())
        .collect::<BTreeSet<_>>();
    let mut plan = FontResourceSyncPlan::default();

    for record in requested {
        match ledger.get(record.id.clone()) {
            Some(existing) if font_record_metadata_matches(existing, &record) => {
                plan.retain.push(record.id);
            }
            _ => plan.upsert.push(record),
        }
    }

    for record in ledger.records() {
        if is_font_projection_resource_record(record) && !requested_ids.contains(&record.id) {
            plan.release.push(record.id.clone());
        }
    }

    plan
}

fn font_record_metadata_matches(
    existing: &NativeResourceRecord,
    next: &NativeResourceRecord,
) -> bool {
    existing.kind == next.kind
        && existing.owner_package_id == next.owner_package_id
        && existing.required_package_ids == next.required_package_ids
        && existing.memory == next.memory
        && existing.label == next.label
}
