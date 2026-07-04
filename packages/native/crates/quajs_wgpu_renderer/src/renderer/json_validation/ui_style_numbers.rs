use crate::projection::safety::{is_safe_native_opacity, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE};
use crate::projection::ui::{
    UiSurfaceBackgroundPositionProjection, UiSurfaceEdgeInsetsProjection, UiSurfaceResolvedStyle,
};

pub(super) fn invalid_native_json_ui_node_opacity_reason(value: f32) -> Option<String> {
    if !is_safe_native_opacity(value) {
        return Some("UI surface node opacity must be finite and between 0 and 1".to_string());
    }
    None
}

pub(super) fn invalid_native_json_ui_style_number_reason(
    style: &UiSurfaceResolvedStyle,
) -> Option<(&'static str, String, String)> {
    validate_optional_opacity("opacity", style.opacity)
        .or_else(|| validate_background_position(style.background_position))
        .or_else(|| validate_optional_logical_value("borderRadius", style.border_radius))
        .or_else(|| validate_optional_logical_value("borderWidth", style.border_width))
        .or_else(|| validate_optional_logical_value("fontSize", style.font_size))
        .or_else(|| validate_optional_logical_value("letterSpacing", style.letter_spacing))
        .or_else(|| validate_optional_logical_value("lineHeight", style.line_height))
        .or_else(|| validate_padding(style.padding))
}

fn validate_optional_opacity(
    field: &'static str,
    value: Option<f32>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    invalid_native_json_ui_node_opacity_reason(value)
        .map(|reason| (field, value.to_string(), reason))
}

fn validate_background_position(
    value: Option<UiSurfaceBackgroundPositionProjection>,
) -> Option<(&'static str, String, String)> {
    let position = value?;
    validate_normalized_value("backgroundPosition.x", position.x)
        .or_else(|| validate_normalized_value("backgroundPosition.y", position.y))
}

fn validate_padding(
    value: Option<UiSurfaceEdgeInsetsProjection>,
) -> Option<(&'static str, String, String)> {
    let padding = value?;
    validate_logical_value("padding.top", padding.top)
        .or_else(|| validate_logical_value("padding.right", padding.right))
        .or_else(|| validate_logical_value("padding.bottom", padding.bottom))
        .or_else(|| validate_logical_value("padding.left", padding.left))
}

fn validate_optional_logical_value(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    validate_logical_value(field, value?)
}

fn validate_logical_value(
    field: &'static str,
    value: f64,
) -> Option<(&'static str, String, String)> {
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "UI surface style numeric values must be finite logical values".to_string(),
        ));
    }
    if value < 0.0 {
        return Some((
            field,
            value.to_string(),
            "UI surface style numeric values must not be negative".to_string(),
        ));
    }
    if value > MAX_NATIVE_UI_STYLE_LOGICAL_VALUE {
        return Some((
            field,
            value.to_string(),
            "UI surface style numeric values exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

fn validate_normalized_value(
    field: &'static str,
    value: f64,
) -> Option<(&'static str, String, String)> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Some((
            field,
            value.to_string(),
            "UI surface style background positions must be finite normalized values between 0 and 1"
                .to_string(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_opacity_accepts_only_finite_normalized_values() {
        assert_eq!(invalid_native_json_ui_node_opacity_reason(0.0), None);
        assert_eq!(invalid_native_json_ui_node_opacity_reason(1.0), None);

        assert!(invalid_native_json_ui_node_opacity_reason(f32::NAN)
            .unwrap()
            .contains("finite"));
        assert!(invalid_native_json_ui_node_opacity_reason(-0.01)
            .unwrap()
            .contains("between 0 and 1"));
        assert!(invalid_native_json_ui_node_opacity_reason(1.01)
            .unwrap()
            .contains("between 0 and 1"));
    }

    #[test]
    fn style_numbers_accept_finite_values_at_native_limits() {
        let style = UiSurfaceResolvedStyle {
            opacity: Some(0.5),
            background_position: Some(UiSurfaceBackgroundPositionProjection { x: 0.0, y: 1.0 }),
            border_radius: Some(MAX_NATIVE_UI_STYLE_LOGICAL_VALUE),
            border_width: Some(0.0),
            font_size: Some(28.0),
            letter_spacing: Some(0.0),
            line_height: Some(MAX_NATIVE_UI_STYLE_LOGICAL_VALUE),
            padding: Some(UiSurfaceEdgeInsetsProjection {
                top: 0.0,
                right: 1.0,
                bottom: MAX_NATIVE_UI_STYLE_LOGICAL_VALUE,
                left: 2.0,
            }),
            ..UiSurfaceResolvedStyle::default()
        };

        assert_eq!(invalid_native_json_ui_style_number_reason(&style), None);
    }

    #[test]
    fn style_numbers_reject_unsafe_values() {
        let opacity = invalid_native_json_ui_style_number_reason(&UiSurfaceResolvedStyle {
            opacity: Some(f32::NAN),
            ..UiSurfaceResolvedStyle::default()
        })
        .unwrap();
        assert_eq!(opacity.0, "opacity");
        assert!(opacity.2.contains("finite"));

        let background_position =
            invalid_native_json_ui_style_number_reason(&UiSurfaceResolvedStyle {
                background_position: Some(UiSurfaceBackgroundPositionProjection {
                    x: 1.01,
                    y: 0.0,
                }),
                ..UiSurfaceResolvedStyle::default()
            })
            .unwrap();
        assert_eq!(background_position.0, "backgroundPosition.x");
        assert!(background_position.2.contains("normalized"));

        let border_width = invalid_native_json_ui_style_number_reason(&UiSurfaceResolvedStyle {
            border_width: Some(-1.0),
            ..UiSurfaceResolvedStyle::default()
        })
        .unwrap();
        assert_eq!(border_width.0, "borderWidth");
        assert!(border_width.2.contains("must not be negative"));

        let padding = invalid_native_json_ui_style_number_reason(&UiSurfaceResolvedStyle {
            padding: Some(UiSurfaceEdgeInsetsProjection {
                top: 0.0,
                right: 0.0,
                bottom: 0.0,
                left: MAX_NATIVE_UI_STYLE_LOGICAL_VALUE + 1.0,
            }),
            ..UiSurfaceResolvedStyle::default()
        })
        .unwrap();
        assert_eq!(padding.0, "padding.left");
        assert!(padding.2.contains("logical limits"));
    }
}
