use quajs_wgpu_renderer::video::{
    VideoBackendCommand, VideoBackendCommandKind, VideoBackendStreamState,
};

use crate::host_assets::{
    validate_native_asset_type, validate_native_package_id, validate_package_relative_asset_name,
};

pub(super) fn validate_video_load_command(
    command: &VideoBackendCommand,
) -> Result<&VideoBackendStreamState, String> {
    if !matches!(command.kind, VideoBackendCommandKind::LoadAsset) {
        return Err("Native video asset sync only accepts LoadAsset commands.".to_string());
    }

    let Some(stream) = command.stream.as_ref() else {
        return Err(format!(
            "Native video LoadAsset command for stream \"{}\" is missing stream metadata.",
            command.stream_id
        ));
    };

    if stream.id != command.stream_id {
        return Err(format!(
            "Native video LoadAsset command stream id \"{}\" does not match stream metadata id \"{}\".",
            command.stream_id, stream.id
        ));
    }

    validate_native_asset_type("video", &stream.asset_type)?;
    validate_package_relative_asset_name("video", &stream.asset_name)?;
    for package_id in &stream.package_candidates {
        validate_native_package_id("video", package_id)?;
    }

    Ok(stream)
}
