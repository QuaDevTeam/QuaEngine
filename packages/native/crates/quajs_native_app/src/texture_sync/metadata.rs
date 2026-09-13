use std::collections::BTreeSet;

use quajs_wgpu_renderer::resources::NativeTextureUploadRequest;

use super::types::NativeTextureUploadMetadata;

pub(super) fn upload_metadata_from_request(
    request: &NativeTextureUploadRequest,
    selected_package_id: Option<&str>,
) -> NativeTextureUploadMetadata {
    let owner_package_id = selected_package_id
        .map(ToString::to_string)
        .or_else(|| single_owner(&request.owner_package_ids));
    let mut required_package_ids = request.required_package_ids.clone();
    required_package_ids.extend(request.owner_package_ids.iter().cloned());
    required_package_ids.extend(request.package_candidates.iter().cloned());
    if let Some(owner_package_id) = &owner_package_id {
        required_package_ids.remove(owner_package_id);
    }

    NativeTextureUploadMetadata {
        owner_package_id,
        required_package_ids,
    }
}

pub(super) fn ordered_package_candidates(request: &NativeTextureUploadRequest) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut packages = Vec::new();
    for package_id in request
        .owner_package_ids
        .iter()
        .chain(request.required_package_ids.iter())
        .chain(request.package_candidates.iter())
    {
        if seen.insert(package_id.clone()) {
            packages.push(package_id.clone());
        }
    }
    packages
}

fn single_owner(owner_package_ids: &BTreeSet<String>) -> Option<String> {
    if owner_package_ids.len() == 1 {
        owner_package_ids.iter().next().cloned()
    } else {
        None
    }
}
