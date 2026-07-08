use quajs_wgpu_renderer::audio::{
    AudioBackendCommand, AudioBackendCommandKind, AudioBackendTrackState,
};

use crate::host_assets::{
    validate_native_asset_type, validate_native_package_id, validate_package_relative_asset_name,
};

pub(super) fn validate_audio_load_command(
    command: &AudioBackendCommand,
) -> Result<&AudioBackendTrackState, String> {
    if !matches!(command.kind, AudioBackendCommandKind::LoadAsset) {
        return Err("Native audio asset sync only accepts LoadAsset commands.".to_string());
    }

    let Some(track) = command.track.as_ref() else {
        return Err(format!(
            "Native audio LoadAsset command for track \"{}\" is missing track metadata.",
            command.track_id
        ));
    };

    if track.id != command.track_id {
        return Err(format!(
            "Native audio LoadAsset command track id \"{}\" does not match track metadata id \"{}\".",
            command.track_id, track.id
        ));
    }

    validate_native_asset_type("audio", &track.asset_type)?;
    validate_package_relative_asset_name("audio", &track.asset_name)?;
    for package_id in &track.package_candidates {
        validate_native_package_id("audio", package_id)?;
    }

    Ok(track)
}
