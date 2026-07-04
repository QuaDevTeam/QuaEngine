use crate::projection::dialogue::RichTextStyle;
use crate::projection::safety::is_safe_native_rich_text_logical_value;

pub(super) fn invalid_native_json_rich_text_style_number_reason(
    style: &RichTextStyle,
) -> Option<(&'static str, String, String)> {
    validate_optional_text_value("fontSize", style.font_size)
        .or_else(|| validate_optional_text_value("lineHeight", style.line_height))
}

fn validate_optional_text_value(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "rich text numeric values must be finite logical values".to_string(),
        ));
    }
    if value <= 0.0 {
        return Some((
            field,
            value.to_string(),
            "rich text numeric values must be greater than 0".to_string(),
        ));
    }
    if !is_safe_native_rich_text_logical_value(value) {
        return Some((
            field,
            value.to_string(),
            "rich text numeric values exceed native renderer logical limits".to_string(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projection::safety::MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE;

    #[test]
    fn rich_text_numbers_accept_finite_values_at_native_limits() {
        let style = RichTextStyle {
            font_size: Some(1.0),
            line_height: Some(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE),
            ..RichTextStyle::default()
        };

        assert_eq!(
            invalid_native_json_rich_text_style_number_reason(&style),
            None
        );
    }

    #[test]
    fn rich_text_numbers_reject_unsafe_values() {
        let zero_font_size = invalid_native_json_rich_text_style_number_reason(&RichTextStyle {
            font_size: Some(0.0),
            ..RichTextStyle::default()
        })
        .unwrap();
        assert_eq!(zero_font_size.0, "fontSize");
        assert!(zero_font_size.2.contains("greater than 0"));

        let oversized_line_height =
            invalid_native_json_rich_text_style_number_reason(&RichTextStyle {
                line_height: Some(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE + 1.0),
                ..RichTextStyle::default()
            })
            .unwrap();
        assert_eq!(oversized_line_height.0, "lineHeight");
        assert!(oversized_line_height.2.contains("logical limits"));
    }
}
