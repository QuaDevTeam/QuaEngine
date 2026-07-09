use serde_json::Value;

use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};

const UNSUPPORTED_AUDIO_TRACK_FIELDS: [(&str, &str); 4] = [
    ("assetKey", "assetName"),
    ("state", "playbackState"),
    ("loop", "looped"),
    ("playing", "playbackState"),
];

const UNSUPPORTED_BACKGROUND_VIDEO_FIELDS: [(&str, &str); 3] = [
    ("playbackState", "playbackRate/seekMs/offsetMs"),
    ("state", "playbackRate/seekMs/offsetMs"),
    ("playing", "playbackRate/seekMs/offsetMs"),
];

pub(crate) fn validate_json_frame_unsupported_fields(
    input: &Value,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut errors = Vec::new();
    validate_background_video_unsupported_fields(input, &mut errors);
    validate_audio_track_unsupported_fields(input, &mut errors);
    if let Some(error) = errors.into_iter().next() {
        return Err(NativeRendererJsonFrameError::Validation(error));
    }
    Ok(())
}

fn validate_background_video_unsupported_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(video) = input
        .get("view")
        .and_then(|view| view.get("background"))
        .and_then(|background| background.get("video"))
        .and_then(Value::as_object)
    else {
        return;
    };

    for (field, supported_fields) in UNSUPPORTED_BACKGROUND_VIDEO_FIELDS {
        if video.contains_key(field) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.background.video.{field}"),
                asset_name: field.to_string(),
                reason: format!(
                    "is not part of the native background video projection JSON; use engine-owned {supported_fields} projection fields"
                ),
            });
            return;
        }
    }
}

fn validate_audio_track_unsupported_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(tracks) = input
        .get("view")
        .and_then(|view| view.get("audio"))
        .and_then(|audio| audio.get("tracks"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for (track_index, track) in tracks.iter().enumerate() {
        let Some(track_object) = track.as_object() else {
            continue;
        };
        for (field, replacement) in UNSUPPORTED_AUDIO_TRACK_FIELDS {
            if track_object.contains_key(field) {
                errors.push(NativeRendererJsonValidationError {
                    path: format!("view.audio.tracks[{track_index}].{field}"),
                    asset_name: field.to_string(),
                    reason: format!(
                        "is not part of the native audio projection JSON; use {replacement}"
                    ),
                });
                return;
            }
        }
    }
}
