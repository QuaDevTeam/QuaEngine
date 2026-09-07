use crate::projection::dialogue::typography::parse_metric;
use crate::projection::dialogue::{RichTextMetric, RichTextStyle};

pub(super) fn invalid_native_json_rich_text_style_number_reason(
    style: &RichTextStyle,
) -> Option<(&'static str, String, String)> {
    validate_optional_text_value("fontSize", style.font_size.as_ref(), false)
        .or_else(|| validate_optional_text_value("lineHeight", style.line_height.as_ref(), true))
}

fn validate_optional_text_value(
    field: &'static str,
    value: Option<&RichTextMetric>,
    line_height: bool,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if parse_metric(value, line_height).is_some() {
        return None;
    }
    let text = match value {
        RichTextMetric::Logical(v) => v.to_string(),
        RichTextMetric::Css(v) => v.clone(),
    };
    Some((field, text, "rich text metrics must be finite within native renderer logical limits; font size must be greater than 0, line height nonnegative; supported CSS units are px, em, %, and unitless/normal line height".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projection::safety::MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE;

    #[test]
    fn rich_text_numbers_accept_finite_values_at_native_limits() {
        let style = RichTextStyle {
            font_size: Some((1.0).into()),
            line_height: Some((MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE).into()),
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
            font_size: Some((0.0).into()),
            ..RichTextStyle::default()
        })
        .unwrap();
        assert_eq!(zero_font_size.0, "fontSize");
        assert!(zero_font_size.2.contains("greater than 0"));

        let oversized_line_height =
            invalid_native_json_rich_text_style_number_reason(&RichTextStyle {
                line_height: Some((MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE + 1.0).into()),
                ..RichTextStyle::default()
            })
            .unwrap();
        assert_eq!(oversized_line_height.0, "lineHeight");
        assert!(oversized_line_height.2.contains("logical limits"));
    }
}
