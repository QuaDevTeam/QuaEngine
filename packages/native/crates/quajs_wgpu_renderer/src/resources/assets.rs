use std::collections::{BTreeMap, BTreeSet};

use crate::projection::common::is_safe_native_asset_ref;

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
    pub owner_package_ids: BTreeSet<String>,
    pub required_package_ids: BTreeSet<String>,
    pub package_candidates: BTreeSet<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureUploadRequestPlan {
    pub requests: Vec<NativeTextureUploadRequest>,
    pub skipped_resource_ids: Vec<ResourceId>,
    pub non_texture_resource_ids: Vec<ResourceId>,
}

impl NativeTextureUploadRequestPlan {
    pub fn request(
        &self,
        asset_type: &str,
        asset_name: &str,
    ) -> Option<&NativeTextureUploadRequest> {
        self.requests
            .iter()
            .find(|request| request.asset_type == asset_type && request.asset_name == asset_name)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeTextureUploadSyncPlan {
    pub pending_requests: Vec<NativeTextureUploadRequest>,
    pub resident_resource_ids: Vec<ResourceId>,
    pub orphaned_resident_resource_ids: Vec<ResourceId>,
    pub skipped_resource_ids: Vec<ResourceId>,
    pub non_texture_resource_ids: Vec<ResourceId>,
}

impl NativeTextureUploadSyncPlan {
    pub fn pending_request(
        &self,
        asset_type: &str,
        asset_name: &str,
    ) -> Option<&NativeTextureUploadRequest> {
        self.pending_requests
            .iter()
            .find(|request| request.asset_type == asset_type && request.asset_name == asset_name)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeTextureUploadRequest {
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub command_ids: BTreeSet<String>,
    pub owner_package_ids: BTreeSet<String>,
    pub required_package_ids: BTreeSet<String>,
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
        asset_request
            .owner_package_ids
            .extend(request.owner_package_ids.iter().cloned());
        asset_request
            .required_package_ids
            .extend(request.required_package_ids.iter().cloned());
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

pub fn plan_texture_upload_requests(
    assets: &NativeAssetRequestPlan,
) -> NativeTextureUploadRequestPlan {
    let mut plan = NativeTextureUploadRequestPlan {
        skipped_resource_ids: assets.skipped_resource_ids.clone(),
        ..Default::default()
    };

    for request in &assets.requests {
        if request.kind == NativeResourceKind::Texture {
            plan.requests
                .push(texture_upload_request_from_asset(request));
        } else {
            plan.non_texture_resource_ids
                .push(request.resource_id.clone());
        }
    }

    plan
}

pub fn plan_texture_upload_sync<I, S>(
    texture_uploads: &NativeTextureUploadRequestPlan,
    resident_texture_resource_ids: I,
) -> NativeTextureUploadSyncPlan
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let resident_ids = resident_texture_resource_ids
        .into_iter()
        .map(|id| id.as_ref().to_string())
        .collect::<BTreeSet<_>>();
    let requested_ids = texture_uploads
        .requests
        .iter()
        .map(|request| request.resource_id.as_str().to_string())
        .collect::<BTreeSet<_>>();
    let mut sync = NativeTextureUploadSyncPlan {
        skipped_resource_ids: texture_uploads.skipped_resource_ids.clone(),
        non_texture_resource_ids: texture_uploads.non_texture_resource_ids.clone(),
        ..Default::default()
    };

    for request in &texture_uploads.requests {
        if resident_ids.contains(request.resource_id.as_str()) {
            sync.resident_resource_ids.push(request.resource_id.clone());
        } else {
            sync.pending_requests.push(request.clone());
        }
    }

    sync.orphaned_resident_resource_ids = resident_ids
        .difference(&requested_ids)
        .map(|id| ResourceId::from(id.clone()))
        .collect();

    sync
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
        owner_package_ids: request.owner_package_ids.clone(),
        required_package_ids: request.required_package_ids.clone(),
        package_candidates: request.package_ids(),
    }
}

fn texture_upload_request_from_asset(request: &NativeAssetRequest) -> NativeTextureUploadRequest {
    NativeTextureUploadRequest {
        resource_id: request.resource_id.clone(),
        asset_type: request.asset_type.clone(),
        asset_name: request.asset_name.clone(),
        command_ids: request.command_ids.clone(),
        owner_package_ids: request.owner_package_ids.clone(),
        required_package_ids: request.required_package_ids.clone(),
        package_candidates: request.package_candidates.clone(),
    }
}

fn parse_asset_resource_id(resource_id: &ResourceId) -> Option<(String, String)> {
    let (asset_type, asset_name) = resource_id.as_str().split_once(':')?;
    if !is_safe_native_asset_ref(asset_type, asset_name) {
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
