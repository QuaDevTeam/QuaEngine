use serde_json::Value;

use crate::renderer::json_input::NativeRendererJsonValidationError;

pub(super) fn validate_audio_track_required_fields(
    input: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(audio) = input.get("view").and_then(|view| view.get("audio")) else {
        return;
    };
    let Some(audio_object) = audio.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.audio".to_string(),
            asset_name: String::new(),
            reason: "must be an object for native audio projections in resolved projection JSON"
                .to_string(),
        });
        return;
    };
    let Some(tracks_value) = audio_object.get("tracks") else {
        return;
    };
    let Some(tracks) = tracks_value.as_array() else {
        errors.push(NativeRendererJsonValidationError {
            path: "view.audio.tracks".to_string(),
            asset_name: String::new(),
            reason: "must be an array for native audio tracks in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    for (track_index, track) in tracks.iter().enumerate() {
        validate_audio_track(track_index, track, errors);
        if !errors.is_empty() {
            return;
        }
    }
}

fn validate_audio_track(
    track_index: usize,
    track: &Value,
    errors: &mut Vec<NativeRendererJsonValidationError>,
) {
    let Some(track_object) = track.as_object() else {
        errors.push(NativeRendererJsonValidationError {
            path: format!("view.audio.tracks[{track_index}]"),
            asset_name: String::new(),
            reason: "must be an object for native audio tracks in resolved projection JSON"
                .to_string(),
        });
        return;
    };

    for field in ["assetType", "loadMode", "playbackState"] {
        if missing_or_null(track_object.get(field)) {
            errors.push(NativeRendererJsonValidationError {
                path: format!("view.audio.tracks[{track_index}].{field}"),
                asset_name: String::new(),
                reason: "must be explicitly provided for native audio tracks in resolved projection JSON"
                    .to_string(),
            });
            return;
        }
    }
}

fn missing_or_null(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
