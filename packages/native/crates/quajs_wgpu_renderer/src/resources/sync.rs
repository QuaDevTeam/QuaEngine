use std::collections::BTreeSet;

use super::ledger::NativeResourceLedger;
use super::plan::{RenderResourcePlan, RenderResourceRequest};
use super::record::{NativeResourceKind, NativeResourceRecord, ResourceId, ResourceMemory};

const UI_AST_BASE_CPU_BYTES: u64 = 1024;
const QSS_STYLE_BASE_CPU_BYTES: u64 = 512;
const TOKEN_TABLE_BASE_CPU_BYTES: u64 = 256;
const RESOURCE_ID_BYTE_WEIGHT: u64 = 2;
const COMMAND_REF_CPU_BYTES: u64 = 64;

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
    record.memory = estimated_resource_memory(request);
    record.label = resource_label(request);

    if record.owner_package_id.is_none() {
        record
            .required_package_ids
            .extend(request.owner_package_ids.iter().cloned());
    }

    record
}

fn estimated_resource_memory(request: &RenderResourceRequest) -> ResourceMemory {
    let base_cpu_bytes = match request.kind {
        NativeResourceKind::UiAst => UI_AST_BASE_CPU_BYTES,
        NativeResourceKind::QssStyle => QSS_STYLE_BASE_CPU_BYTES,
        NativeResourceKind::TokenTable => TOKEN_TABLE_BASE_CPU_BYTES,
        _ => return ResourceMemory::default(),
    };
    let id_bytes = (request.id.as_str().len() as u64).saturating_mul(RESOURCE_ID_BYTE_WEIGHT);
    let command_bytes = (request.command_ids.len() as u64).saturating_mul(COMMAND_REF_CPU_BYTES);

    ResourceMemory {
        cpu_bytes: base_cpu_bytes
            .saturating_add(id_bytes)
            .saturating_add(command_bytes),
        gpu_bytes: 0,
    }
}

fn resource_label(request: &RenderResourceRequest) -> Option<String> {
    let label_kind = match request.kind {
        NativeResourceKind::UiAst => "ui ast",
        NativeResourceKind::QssStyle => "qss style",
        NativeResourceKind::TokenTable => "token table",
        _ => return None,
    };

    Some(format!("{label_kind} {}", request.id.as_str()))
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
