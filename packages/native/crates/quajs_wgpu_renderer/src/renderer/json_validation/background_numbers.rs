const MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE: f64 = 1_000_000.0;
const MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION: f64 = 1_000_000.0;
const MAX_NATIVE_BACKGROUND_SCALE: f64 = 1_000.0;

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
}
