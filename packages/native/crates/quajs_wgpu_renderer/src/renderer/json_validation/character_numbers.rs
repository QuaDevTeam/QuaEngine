use crate::projection::character::CharacterPosition;
use crate::projection::safety::{
    MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE, MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION,
    MAX_NATIVE_CHARACTER_PERCENT, MAX_NATIVE_CHARACTER_ROTATION_DEGREES,
    MAX_NATIVE_CHARACTER_SCALE,
};

pub(super) fn invalid_native_json_character_position_reason(
    position: &CharacterPosition,
) -> Option<(&'static str, String, String)> {
    validate_optional_coordinate("x", position.x)
        .or_else(|| validate_optional_coordinate("y", position.y))
        .or_else(|| validate_optional_percent("xPercent", position.x_percent))
        .or_else(|| validate_optional_percent("yPercent", position.y_percent))
        .or_else(|| validate_optional_scale(position.scale))
        .or_else(|| validate_optional_rotation(position.rotation))
        .or_else(|| validate_optional_dimension("width", position.width))
        .or_else(|| validate_optional_dimension("height", position.height))
}

pub(super) fn invalid_native_json_character_opacity_reason(value: f32) -> Option<String> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Some("character opacity must be finite and between 0 and 1".to_string());
    }
    None
}

fn validate_optional_coordinate(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "character coordinates must be finite logical values".to_string(),
        ));
    }
    if value.abs() > MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE {
        return Some((
            field,
            value.to_string(),
            "character coordinates exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

fn validate_optional_percent(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "character percentage positions must be finite values".to_string(),
        ));
    }
    if value.abs() > MAX_NATIVE_CHARACTER_PERCENT {
        return Some((
            field,
            value.to_string(),
            "character percentage positions exceed native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_optional_scale(scale: Option<f64>) -> Option<(&'static str, String, String)> {
    let scale = scale?;
    if !scale.is_finite() {
        return Some((
            "scale",
            scale.to_string(),
            "character scale must be a finite value".to_string(),
        ));
    }
    if scale <= 0.0 {
        return Some((
            "scale",
            scale.to_string(),
            "character scale must be greater than 0".to_string(),
        ));
    }
    if scale > MAX_NATIVE_CHARACTER_SCALE {
        return Some((
            "scale",
            scale.to_string(),
            "character scale exceeds native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_optional_rotation(rotation: Option<f64>) -> Option<(&'static str, String, String)> {
    let rotation = rotation?;
    if !rotation.is_finite() {
        return Some((
            "rotation",
            rotation.to_string(),
            "character rotation must be a finite value".to_string(),
        ));
    }
    if rotation.abs() > MAX_NATIVE_CHARACTER_ROTATION_DEGREES {
        return Some((
            "rotation",
            rotation.to_string(),
            "character rotation exceeds native renderer limits".to_string(),
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
            "character dimensions must be finite logical values".to_string(),
        ));
    }
    if value < 0.0 {
        return Some((
            field,
            value.to_string(),
            "character dimensions must not be negative".to_string(),
        ));
    }
    if value > MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION {
        return Some((
            field,
            value.to_string(),
            "character dimensions exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_accepts_finite_values_at_native_limits() {
        let position = CharacterPosition {
            x: Some(-MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE),
            y: Some(MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE),
            x_percent: Some(-MAX_NATIVE_CHARACTER_PERCENT),
            y_percent: Some(MAX_NATIVE_CHARACTER_PERCENT),
            scale: Some(MAX_NATIVE_CHARACTER_SCALE),
            rotation: Some(-MAX_NATIVE_CHARACTER_ROTATION_DEGREES),
            width: Some(MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION),
            height: Some(0.0),
            ..Default::default()
        };

        assert_eq!(
            invalid_native_json_character_position_reason(&position),
            None
        );
    }

    #[test]
    fn position_rejects_unsafe_values() {
        let negative_width = invalid_native_json_character_position_reason(&CharacterPosition {
            width: Some(-1.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(negative_width.0, "width");
        assert!(negative_width.2.contains("must not be negative"));

        let oversized_percent = invalid_native_json_character_position_reason(&CharacterPosition {
            x_percent: Some(MAX_NATIVE_CHARACTER_PERCENT + 1.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(oversized_percent.0, "xPercent");
        assert!(oversized_percent.2.contains("exceed"));

        let zero_scale = invalid_native_json_character_position_reason(&CharacterPosition {
            scale: Some(0.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(zero_scale.0, "scale");
        assert!(zero_scale.2.contains("greater than 0"));

        let oversized_rotation =
            invalid_native_json_character_position_reason(&CharacterPosition {
                rotation: Some(MAX_NATIVE_CHARACTER_ROTATION_DEGREES + 1.0),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(oversized_rotation.0, "rotation");
        assert!(oversized_rotation.2.contains("exceeds"));
    }

    #[test]
    fn opacity_accepts_only_finite_normalized_values() {
        assert_eq!(invalid_native_json_character_opacity_reason(0.0), None);
        assert_eq!(invalid_native_json_character_opacity_reason(1.0), None);

        assert!(invalid_native_json_character_opacity_reason(f32::NAN)
            .unwrap()
            .contains("finite"));
        assert!(invalid_native_json_character_opacity_reason(-0.01)
            .unwrap()
            .contains("between 0 and 1"));
        assert!(invalid_native_json_character_opacity_reason(1.01)
            .unwrap()
            .contains("between 0 and 1"));
    }
}
