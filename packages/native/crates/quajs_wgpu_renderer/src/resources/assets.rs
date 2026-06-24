use std::collections::{BTreeMap, BTreeSet};

use super::plan::{RenderResourcePlan, RenderResourceRequest};
use super::record::{NativeResourceKind, ResourceId};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeAssetRequestPlan {
    pub requests: Vec<NativeAssetRequest>,
    pub skipped_resource_ids: Vec<ResourceId>,
}

impl NativeAssetRequestPlan {
    pub fn request(&self, asset_type: &str, asset_name: &str) -> Option<&NativeAssetRequest> {
        self.requests
            .iter()
            .find(|request| request.asset_type == asset_type && request.asset_name == asset_name)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeAssetRequest {
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub kind: NativeResourceKind,
    pub command_ids: BTreeSet<String>,
    pub package_candidates: BTreeSet<String>,
}

pub fn plan_asset_requests(resources: &RenderResourcePlan) -> NativeAssetRequestPlan {
    let mut requests = BTreeMap::<(String, String), NativeAssetRequest>::new();
    let mut skipped_resource_ids = Vec::new();

    for request in &resources.requests {
        let Some((asset_type, asset_name)) = parse_asset_resource_id(&request.id) else {
            skipped_resource_ids.push(request.id.clone());
            continue;
        };

        let key = (asset_type.clone(), asset_name.clone());
        let asset_request = requests
            .entry(key)
            .or_insert_with(|| asset_request_from_resource(request, asset_type, asset_name));

        asset_request.kind = merge_asset_kind(asset_request.kind, request.kind);
        asset_request
            .command_ids
            .extend(request.command_ids.iter().cloned());
        asset_request
            .package_candidates
            .extend(request.package_ids());
    }

    NativeAssetRequestPlan {
        requests: requests.into_values().collect(),
        skipped_resource_ids,
    }
}

pub fn is_declarative_asset_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::UiAst | NativeResourceKind::QssStyle | NativeResourceKind::TokenTable
    )
}

fn asset_request_from_resource(
    request: &RenderResourceRequest,
    asset_type: String,
    asset_name: String,
) -> NativeAssetRequest {
    NativeAssetRequest {
        resource_id: request.id.clone(),
        asset_type,
        asset_name,
        kind: request.kind,
        command_ids: request.command_ids.clone(),
        package_candidates: request.package_ids(),
    }
}

fn parse_asset_resource_id(resource_id: &ResourceId) -> Option<(String, String)> {
    let (asset_type, asset_name) = resource_id.as_str().split_once(':')?;
    if asset_type.is_empty() || asset_name.is_empty() {
        return None;
    }

    Some((asset_type.to_string(), asset_name.to_string()))
}

fn merge_asset_kind(
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

#[cfg(test)]
mod tests;
