use quajs_wgpu_renderer::fonts::{
    FontBackendCommand, FontBackendCommandKind, FontBackendFaceState,
};

use crate::host_assets::{
    validate_native_asset_type, validate_native_package_id, validate_package_relative_asset_name,
};

pub(super) fn validate_font_load_command(
    command: &FontBackendCommand,
) -> Result<&FontBackendFaceState, String> {
    if !matches!(command.kind, FontBackendCommandKind::LoadFace) {
        return Err("Native font asset sync only accepts LoadFace commands.".to_string());
    }

    let Some(face) = command.face.as_ref() else {
        return Err(format!(
            "Native font LoadFace command for face \"{}\" is missing face metadata.",
            command.face_id
        ));
    };

    if face.id != command.face_id {
        return Err(format!(
            "Native font LoadFace command face id \"{}\" does not match face metadata id \"{}\".",
            command.face_id, face.id
        ));
    }

    validate_native_asset_type("font", &face.asset_type)?;
    validate_package_relative_asset_name("font", &face.asset_name)?;
    for package_id in &face.package_candidates {
        validate_native_package_id("font", package_id)?;
    }

    Ok(face)
}
