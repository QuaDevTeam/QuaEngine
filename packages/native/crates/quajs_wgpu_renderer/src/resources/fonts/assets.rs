use std::collections::{BTreeMap, BTreeSet};

use super::super::assets::{NativeAssetRequest, NativeAssetRequestPlan};
use super::super::ledger::NativeResourceLedger;
use super::super::record::{NativeResourceKind, NativeResourceRecord, ResourceId};
use super::sync::FontResourceSyncPlan;
use crate::projection::common::is_safe_native_asset_ref;

pub fn plan_font_asset_requests(
    ledger: &NativeResourceLedger,
    sync: &FontResourceSyncPlan,
) -> NativeAssetRequestPlan {
    let mut requests = BTreeMap::<(String, String), NativeAssetRequest>::new();
    let mut skipped_resource_ids = Vec::new();

    for record in sync
        .upsert
        .iter()
        .chain(sync.retain.iter().filter_map(|id| ledger.get(id.clone())))
    {
        let Some((asset_type, asset_name)) = parse_font_asset_resource_id(&record.id) else {
            skipped_resource_ids.push(record.id.clone());
            continue;
        };
        let key = (asset_type.clone(), asset_name.clone());
        let request = requests.entry(key).or_insert_with(|| NativeAssetRequest {
            resource_id: record.id.clone(),
            asset_type,
            asset_name,
            kind: record.kind,
            command_ids: BTreeSet::new(),
            owner_package_ids: BTreeSet::new(),
            required_package_ids: BTreeSet::new(),
            package_candidates: BTreeSet::new(),
        });
        request.kind = merge_font_asset_kind(request.kind, record.kind);
        request
            .package_candidates
            .extend(font_package_candidates(record));
        if let Some(owner_package_id) = &record.owner_package_id {
            request.owner_package_ids.insert(owner_package_id.clone());
        }
        request
            .required_package_ids
            .extend(record.required_package_ids.iter().cloned());
    }

    NativeAssetRequestPlan {
        requests: requests.into_values().collect(),
        skipped_resource_ids,
    }
}

fn parse_font_asset_resource_id(resource_id: &ResourceId) -> Option<(String, String)> {
    let mut parts = resource_id.as_str().splitn(4, ':');
    let namespace = parts.next()?;
    let resource_kind = parts.next()?;
    let asset_type = parts.next()?;
    let asset_name = parts.next()?;

    if namespace != "font" || resource_kind != "face" {
        return None;
    }
    if !is_safe_native_asset_ref(asset_type, asset_name) {
        return None;
    }

    Some((asset_type.to_string(), asset_name.to_string()))
}

fn font_package_candidates(record: &NativeResourceRecord) -> BTreeSet<String> {
    let mut candidates = record.required_package_ids.clone();
    if let Some(package_id) = &record.owner_package_id {
        candidates.insert(package_id.clone());
    }
    candidates
}

fn merge_font_asset_kind(
    existing: NativeResourceKind,
    incoming: NativeResourceKind,
) -> NativeResourceKind {
    if existing == incoming {
        existing
    } else if existing == NativeResourceKind::Other {
        incoming
    } else if incoming == NativeResourceKind::Other {
        existing
    } else {
        NativeResourceKind::Other
    }
}
