use quajs_wgpu_renderer::resources::NativeTextureUploadRequest;

use crate::host_assets::{
    validate_native_asset_type, validate_native_package_id, validate_package_relative_asset_name,
};

pub(super) fn validate_texture_upload_request(
    request: &NativeTextureUploadRequest,
) -> Result<(), String> {
    validate_native_asset_type("texture", &request.asset_type)?;
    validate_package_relative_asset_name("texture", &request.asset_name)?;
    for package_id in request
        .owner_package_ids
        .iter()
        .chain(request.required_package_ids.iter())
        .chain(request.package_candidates.iter())
    {
        validate_native_package_id("texture", package_id)?;
    }
    Ok(())
}
