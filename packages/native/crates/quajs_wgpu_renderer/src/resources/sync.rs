use std::collections::BTreeSet;

use super::ledger::NativeResourceLedger;
use super::plan::{RenderResourcePlan, RenderResourceRequest};
use super::record::{NativeResourceKind, NativeResourceRecord, ResourceId};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FrameResourceSyncPlan {
    pub upsert: Vec<NativeResourceRecord>,
    pub retain: Vec<ResourceId>,
    pub release: Vec<ResourceId>,
}

impl FrameResourceSyncPlan {
    pub fn is_empty(&self) -> bool {
        self.upsert.is_empty() && self.retain.is_empty() && self.release.is_empty()
    }
}

pub fn plan_frame_resource_sync(
    ledger: &NativeResourceLedger,
    resources: &RenderResourcePlan,
) -> FrameResourceSyncPlan {
    let requested_ids = resources
        .requests
        .iter()
        .map(|request| request.id.clone())
        .collect::<BTreeSet<_>>();
    let mut plan = FrameResourceSyncPlan::default();

    for request in &resources.requests {
        let next = record_from_request(request);
        match ledger.get(request.id.clone()) {
            Some(existing) if record_metadata_matches(existing, &next) => {
                plan.retain.push(request.id.clone());
            }
            _ => plan.upsert.push(next),
        }
    }

    for record in ledger.records() {
        if !requested_ids.contains(&record.id) && is_frame_managed_kind(record.kind) {
            plan.release.push(record.id.clone());
        }
    }

    plan
}

fn record_from_request(request: &RenderResourceRequest) -> NativeResourceRecord {
    let mut record = NativeResourceRecord::new(request.id.clone(), request.kind);
    record.owner_package_id = single_owner(&request.owner_package_ids);
    record.required_package_ids = request.required_package_ids.clone();

    if record.owner_package_id.is_none() {
        record
            .required_package_ids
            .extend(request.owner_package_ids.iter().cloned());
    }

    record
}

fn single_owner(owner_package_ids: &BTreeSet<String>) -> Option<String> {
    if owner_package_ids.len() == 1 {
        owner_package_ids.iter().next().cloned()
    } else {
        None
    }
}

fn record_metadata_matches(existing: &NativeResourceRecord, next: &NativeResourceRecord) -> bool {
    existing.kind == next.kind
        && existing.owner_package_id == next.owner_package_id
        && existing.required_package_ids == next.required_package_ids
}

fn is_frame_managed_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::Texture
            | NativeResourceKind::Buffer
            | NativeResourceKind::GlyphAtlas
            | NativeResourceKind::FontFace
            | NativeResourceKind::DecodedImage
            | NativeResourceKind::VideoDecoder
            | NativeResourceKind::VideoFrameQueue
            | NativeResourceKind::VideoTextureRing
            | NativeResourceKind::UiAst
            | NativeResourceKind::QssStyle
            | NativeResourceKind::TokenTable
            | NativeResourceKind::RenderGraph
    )
}

#[cfg(test)]
mod tests;
