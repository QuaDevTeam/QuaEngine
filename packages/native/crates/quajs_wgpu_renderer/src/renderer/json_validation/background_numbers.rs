use crate::projection::safety::{
    MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE, MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION,
    MAX_NATIVE_BACKGROUND_ROTATION_DEGREES, MAX_NATIVE_BACKGROUND_SCALE,
    MAX_NATIVE_VIDEO_PLAYBACK_RATE, MAX_NATIVE_VIDEO_POSITION_MS,
};

pub(super) fn invalid_native_json_background_geometry_reason(
    x: f64,
    y: f64,
    width: Option<f64>,
    height: Option<f64>,
    scale: f64,
) -> Option<(&'static str, String, String)> {
    validate_coordinate("x", x)
        .or_else(|| validate_coordinate("y", y))
        .or_else(|| validate_optional_dimension("width", width))
        .or_else(|| validate_optional_dimension("height", height))
        .or_else(|| validate_scale(scale))
}

pub(super) fn invalid_native_json_background_opacity_reason(value: f32) -> Option<String> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Some("background opacity must be finite and between 0 and 1".to_string());
    }
    None
}

pub(super) fn invalid_native_json_video_volume_reason(value: Option<f32>) -> Option<String> {
    let value = value?;
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Some("video volume must be finite and between 0 and 1".to_string());
    }
    None
}

pub(super) fn invalid_native_json_video_playback_rate_reason(value: Option<f32>) -> Option<String> {
    let value = value?;
    if !value.is_finite() {
        return Some("video playbackRate must be finite".to_string());
    }
    if value <= 0.0 {
        return Some("video playbackRate must be greater than 0".to_string());
    }
    if value > MAX_NATIVE_VIDEO_PLAYBACK_RATE {
        return Some("video playbackRate exceeds native renderer limits".to_string());
    }
    None
}

pub(super) fn invalid_native_json_video_position_reason(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((field, format!("video {field} must be finite")));
    }
    if value < 0.0 {
        return Some((field, format!("video {field} must not be negative")));
    }
    if value > MAX_NATIVE_VIDEO_POSITION_MS {
        return Some((
            field,
            format!("video {field} exceeds native renderer limits"),
        ));
    }
    None
}

pub(super) fn invalid_native_json_background_rotation_reason(
    rotation: f64,
) -> Option<(&'static str, String, String)> {
    if !rotation.is_finite() {
        return Some((
            "rotation",
            rotation.to_string(),
            "background rotation must be a finite value".to_string(),
        ));
    }
    if rotation.abs() > MAX_NATIVE_BACKGROUND_ROTATION_DEGREES {
        return Some((
            "rotation",
            rotation.to_string(),
            "background rotation exceeds native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_coordinate(field: &'static str, value: f64) -> Option<(&'static str, String, String)> {
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "background coordinates must be finite logical values".to_string(),
        ));
    }
    if value.abs() > MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE {
        return Some((
            field,
            value.to_string(),
            "background coordinates exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

fn validate_optional_dimension(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "background dimensions must be finite logical values".to_string(),
        ));
    }
    if value < 0.0 {
        return Some((
            field,
            value.to_string(),
            "background dimensions must not be negative".to_string(),
        ));
    }
    if value > MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION {
        return Some((
            field,
            value.to_string(),
            "background dimensions exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

fn validate_scale(scale: f64) -> Option<(&'static str, String, String)> {
    if !scale.is_finite() {
        return Some((
            "scale",
            scale.to_string(),
            "background scale must be a finite value".to_string(),
        ));
    }
    if scale <= 0.0 {
        return Some((
            "scale",
            scale.to_string(),
            "background scale must be greater than 0".to_string(),
        ));
    }
    if scale > MAX_NATIVE_BACKGROUND_SCALE {
        return Some((
            "scale",
            scale.to_string(),
            "background scale exceeds native renderer limits".to_string(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn geometry_accepts_finite_values_at_native_limits() {
        assert_eq!(
            invalid_native_json_background_geometry_reason(
                -MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE,
                MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE,
                Some(MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION),
                Some(0.0),
                MAX_NATIVE_BACKGROUND_SCALE,
            ),
            None
        );
    }

    #[test]
    fn geometry_rejects_unsafe_values() {
        let negative_width =
            invalid_native_json_background_geometry_reason(0.0, 0.0, Some(-1.0), None, 1.0)
                .unwrap();
        assert_eq!(negative_width.0, "width");
        assert!(negative_width.2.contains("must not be negative"));

        let oversized_x = invalid_native_json_background_geometry_reason(
            MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE + 1.0,
            0.0,
            None,
            None,
            1.0,
        )
        .unwrap();
        assert_eq!(oversized_x.0, "x");
        assert!(oversized_x.2.contains("logical limits"));

        let zero_scale =
            invalid_native_json_background_geometry_reason(0.0, 0.0, None, None, 0.0).unwrap();
        assert_eq!(zero_scale.0, "scale");
        assert!(zero_scale.2.contains("greater than 0"));
    }

    #[test]
    fn opacity_accepts_only_finite_normalized_values() {
        assert_eq!(invalid_native_json_background_opacity_reason(0.0), None);
        assert_eq!(invalid_native_json_background_opacity_reason(1.0), None);

        assert!(invalid_native_json_background_opacity_reason(f32::NAN)
            .unwrap()
            .contains("finite"));
        assert!(invalid_native_json_background_opacity_reason(-0.01)
            .unwrap()
            .contains("between 0 and 1"));
        assert!(invalid_native_json_background_opacity_reason(1.01)
            .unwrap()
            .contains("between 0 and 1"));
    }

    #[test]
    fn video_playback_policy_accepts_only_finite_safe_values() {
        assert_eq!(invalid_native_json_video_volume_reason(None), None);
        assert_eq!(invalid_native_json_video_volume_reason(Some(0.0)), None);
        assert_eq!(invalid_native_json_video_volume_reason(Some(1.0)), None);
        assert!(invalid_native_json_video_volume_reason(Some(1.01))
            .unwrap()
            .contains("between 0 and 1"));

        assert_eq!(invalid_native_json_video_playback_rate_reason(None), None);
        assert_eq!(
            invalid_native_json_video_playback_rate_reason(Some(MAX_NATIVE_VIDEO_PLAYBACK_RATE)),
            None
        );
        assert!(invalid_native_json_video_playback_rate_reason(Some(0.0))
            .unwrap()
            .contains("greater than 0"));
        assert!(invalid_native_json_video_playback_rate_reason(Some(
            MAX_NATIVE_VIDEO_PLAYBACK_RATE + 1.0
        ))
        .unwrap()
        .contains("exceeds"));

        assert_eq!(
            invalid_native_json_video_position_reason("seekMs", None),
            None
        );
        assert_eq!(
            invalid_native_json_video_position_reason("seekMs", Some(MAX_NATIVE_VIDEO_POSITION_MS)),
            None
        );
        assert!(
            invalid_native_json_video_position_reason("seekMs", Some(-1.0))
                .unwrap()
                .1
                .contains("must not be negative")
        );
        assert!(invalid_native_json_video_position_reason(
            "offsetMs",
            Some(MAX_NATIVE_VIDEO_POSITION_MS + 1.0),
        )
        .unwrap()
        .1
        .contains("exceeds"));
    }

    #[test]
    fn rotation_accepts_only_finite_values_at_native_limits() {
        assert_eq!(
            invalid_native_json_background_rotation_reason(MAX_NATIVE_BACKGROUND_ROTATION_DEGREES),
            None
        );
        assert_eq!(
            invalid_native_json_background_rotation_reason(-MAX_NATIVE_BACKGROUND_ROTATION_DEGREES),
            None
        );

        let nan = invalid_native_json_background_rotation_reason(f64::NAN).unwrap();
        assert_eq!(nan.0, "rotation");
        assert!(nan.2.contains("finite"));

        let oversized = invalid_native_json_background_rotation_reason(
            MAX_NATIVE_BACKGROUND_ROTATION_DEGREES + 1.0,
        )
        .unwrap();
        assert_eq!(oversized.0, "rotation");
        assert!(oversized.2.contains("exceeds"));
    }
}
