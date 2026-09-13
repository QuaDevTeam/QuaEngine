use crate::projection::safety::{
    is_safe_native_ui_scroll_offset, MAX_NATIVE_UI_LOGICAL_COORDINATE,
    MAX_NATIVE_UI_LOGICAL_DIMENSION,
};
use crate::projection::ui::UiSurfaceNodeRect;

#[cfg(test)]
use crate::projection::safety::MAX_NATIVE_UI_SCROLL_OFFSET;

pub(super) fn invalid_native_json_ui_rect_reason(
    rect: &UiSurfaceNodeRect,
) -> Option<(&'static str, String, String)> {
    validate_rect_coordinate("x", rect.x)
        .or_else(|| validate_rect_coordinate("y", rect.y))
        .or_else(|| validate_rect_dimension("width", rect.width))
        .or_else(|| validate_rect_dimension("height", rect.height))
}

pub(super) fn invalid_native_json_scroll_offset_reason(value: f64) -> Option<String> {
    if !value.is_finite() {
        return Some("UI scroll offsets must be finite logical values".to_string());
    }
    if !is_safe_native_ui_scroll_offset(value) {
        return Some("UI scroll offsets exceed native renderer logical limits".to_string());
    }
    None
}

fn validate_rect_coordinate(
    field: &'static str,
    value: f64,
) -> Option<(&'static str, String, String)> {
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "UI surface bounds coordinates must be finite logical values".to_string(),
        ));
    }
    if value.abs() > MAX_NATIVE_UI_LOGICAL_COORDINATE {
        return Some((
            field,
            value.to_string(),
            "UI surface bounds coordinates exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

fn validate_rect_dimension(
    field: &'static str,
    value: f64,
) -> Option<(&'static str, String, String)> {
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "UI surface bounds dimensions must be finite logical values".to_string(),
        ));
    }
    if value < 0.0 {
        return Some((
            field,
            value.to_string(),
            "UI surface bounds dimensions must not be negative".to_string(),
        ));
    }
    if value > MAX_NATIVE_UI_LOGICAL_DIMENSION {
        return Some((
            field,
            value.to_string(),
            "UI surface bounds dimensions exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
        UiSurfaceNodeRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn ui_rect_accepts_finite_values_at_native_limits() {
        assert_eq!(
            invalid_native_json_ui_rect_reason(&rect(
                -MAX_NATIVE_UI_LOGICAL_COORDINATE,
                MAX_NATIVE_UI_LOGICAL_COORDINATE,
                MAX_NATIVE_UI_LOGICAL_DIMENSION,
                0.0,
            )),
            None
        );
    }

    #[test]
    fn ui_rect_rejects_non_finite_and_unsafe_dimensions() {
        let non_finite_x =
            invalid_native_json_ui_rect_reason(&rect(f64::INFINITY, 0.0, 10.0, 10.0)).unwrap();
        assert_eq!(non_finite_x.0, "x");
        assert!(non_finite_x.2.contains("finite logical values"));

        let negative_width =
            invalid_native_json_ui_rect_reason(&rect(0.0, 0.0, -1.0, 10.0)).unwrap();
        assert_eq!(negative_width.0, "width");
        assert!(negative_width.2.contains("must not be negative"));

        let oversized_height = invalid_native_json_ui_rect_reason(&rect(
            0.0,
            0.0,
            10.0,
            MAX_NATIVE_UI_LOGICAL_DIMENSION + 1.0,
        ))
        .unwrap();
        assert_eq!(oversized_height.0, "height");
        assert!(oversized_height.2.contains("logical limits"));
    }

    #[test]
    fn scroll_offsets_reject_non_finite_and_oversized_values() {
        assert_eq!(
            invalid_native_json_scroll_offset_reason(MAX_NATIVE_UI_SCROLL_OFFSET),
            None
        );
        assert_eq!(
            invalid_native_json_scroll_offset_reason(-MAX_NATIVE_UI_SCROLL_OFFSET),
            None
        );

        let non_finite = invalid_native_json_scroll_offset_reason(f64::NAN).unwrap();
        assert!(non_finite.contains("finite logical values"));

        let oversized =
            invalid_native_json_scroll_offset_reason(MAX_NATIVE_UI_SCROLL_OFFSET + 1.0).unwrap();
        assert!(oversized.contains("logical limits"));
    }
}
