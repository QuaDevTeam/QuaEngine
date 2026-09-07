//! CSS computed-value inheritance at the native projection boundary. Logical
//! lengths are resolved here; `normal` waits for the selected QPK font metrics.
use super::types::{RichTextMetric, RichTextStyle};
use crate::projection::safety::MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Metric {
    Length(f64),
    Em(f64),
    Percent(f64),
    Multiplier(f64),
    Normal,
}

pub(crate) fn parse_metric(value: &RichTextMetric, line_height: bool) -> Option<Metric> {
    let metric = match value {
        RichTextMetric::Logical(value) => Metric::Length(*value),
        RichTextMetric::Css(css) => {
            let css = css.trim().to_ascii_lowercase();
            if line_height && css == "normal" {
                return Some(Metric::Normal);
            }
            if let Some(value) = css.strip_suffix("px") {
                Metric::Length(value.parse().ok()?)
            } else if let Some(value) = css.strip_suffix("em") {
                Metric::Em(value.parse().ok()?)
            } else if let Some(value) = css.strip_suffix('%') {
                Metric::Percent(value.parse().ok()?)
            } else if line_height {
                Metric::Multiplier(css.parse().ok()?)
            } else {
                return None;
            }
        }
    };
    let number = match metric {
        Metric::Length(v) | Metric::Em(v) | Metric::Percent(v) | Metric::Multiplier(v) => v,
        Metric::Normal => unreachable!(),
    };
    (number.is_finite()
        && (number > 0.0 || line_height && number == 0.0)
        && (number == 0.0
            || crate::projection::safety::is_safe_native_rich_text_logical_value(number)))
    .then_some(metric)
}

pub(crate) fn font_size(style: &RichTextStyle, fallback: f64) -> f64 {
    (match style
        .font_size
        .as_ref()
        .and_then(|v| parse_metric(v, false))
    {
        Some(Metric::Length(v)) => v,
        Some(Metric::Em(v)) => fallback * v,
        Some(Metric::Percent(v)) => fallback * v / 100.0,
        _ => fallback,
    })
    .min(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE)
}

pub(crate) fn line_height(style: &RichTextStyle, font_size: f64, fallback: f64) -> f64 {
    (match style
        .line_height
        .as_ref()
        .and_then(|v| parse_metric(v, true))
    {
        Some(Metric::Length(v)) => v,
        Some(Metric::Em(v) | Metric::Multiplier(v)) => font_size * v,
        Some(Metric::Percent(v)) => font_size * v / 100.0,
        Some(Metric::Normal) => font_size * 1.2, // fallback before fonts are available
        _ => fallback,
    })
    .min(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE)
}

pub(crate) fn normal_line_height(style: &RichTextStyle) -> bool {
    matches!(
        style
            .line_height
            .as_ref()
            .and_then(|v| parse_metric(v, true)),
        Some(Metric::Normal)
    )
}

pub(crate) fn defaults(size: f64, height: f64) -> RichTextStyle {
    RichTextStyle {
        font_size: Some(size.into()),
        line_height: Some(height.into()),
        ..Default::default()
    }
}

pub(crate) fn inherit(parent: &RichTextStyle, child: &RichTextStyle) -> RichTextStyle {
    let parent_size = font_size(parent, 20.0);
    let size = font_size(child, parent_size).min(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE);
    let height = child
        .line_height
        .as_ref()
        .and_then(|value| match parse_metric(value, true)? {
            // CSS em/percent line heights compute once, at the declaring element.
            // Only a unitless multiplier (and normal) remains relative on inheritance.
            Metric::Em(v) => Some(RichTextMetric::Logical(
                (size * v).min(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE),
            )),
            Metric::Percent(v) => Some(RichTextMetric::Logical(
                (size * v / 100.0).min(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE),
            )),
            Metric::Length(v) => Some(RichTextMetric::Logical(v)),
            Metric::Multiplier(_) | Metric::Normal => Some(value.clone()),
        })
        .or_else(|| parent.line_height.clone());
    RichTextStyle {
        font_size: Some(size.into()),
        line_height: height,
        color: child.color.clone().or_else(|| parent.color.clone()),
        font_family: child
            .font_family
            .clone()
            .or_else(|| parent.font_family.clone()),
        font_weight: child
            .font_weight
            .clone()
            .or_else(|| parent.font_weight.clone()),
        text_align: child
            .text_align
            .clone()
            .or_else(|| parent.text_align.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unitless_line_height_recomputes_but_percent_and_em_inherit_computed_length() {
        for (height, expected) in [
            ("1.5", 60.0),
            ("150%", 30.0),
            ("1.5em", 30.0),
            ("30px", 30.0),
        ] {
            let parent = inherit(
                &defaults(20.0, 36.0),
                &RichTextStyle {
                    line_height: Some(height.into()),
                    ..Default::default()
                },
            );
            let child = inherit(
                &parent,
                &RichTextStyle {
                    font_size: Some("200%".into()),
                    ..Default::default()
                },
            );
            assert_eq!(font_size(&child, 0.0), 40.0);
            assert_eq!(line_height(&child, 40.0, 0.0), expected, "{height}");
        }
    }

    #[test]
    fn relative_font_sizes_resolve_at_each_level_and_normal_survives_inheritance() {
        let root = inherit(
            &defaults(20.0, 36.0),
            &RichTextStyle {
                font_size: Some("150%".into()),
                line_height: Some("normal".into()),
                ..Default::default()
            },
        );
        let block = inherit(
            &root,
            &RichTextStyle {
                font_size: Some("2em".into()),
                ..Default::default()
            },
        );
        let span = inherit(
            &block,
            &RichTextStyle {
                font_size: Some("50%".into()),
                ..Default::default()
            },
        );
        assert_eq!(font_size(&block, 0.0), 60.0);
        assert_eq!(font_size(&span, 0.0), 30.0);
        assert!(normal_line_height(&span));
    }

    #[test]
    fn rejects_malformed_metrics_and_bounds_relative_products() {
        for css in ["1 em", "NaNpx", "inf", "-1", "calc(2px)", "20vh", ""] {
            assert_eq!(parse_metric(&css.into(), true), None, "{css}");
        }
        assert_eq!(
            parse_metric(&"0".into(), true),
            Some(Metric::Multiplier(0.0))
        );
        assert_eq!(parse_metric(&"0px".into(), false), None);
        let large = inherit(
            &defaults(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE, 36.0),
            &RichTextStyle {
                font_size: Some("2em".into()),
                line_height: Some("2em".into()),
                ..Default::default()
            },
        );
        assert_eq!(font_size(&large, 0.0), MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE);
        assert_eq!(
            line_height(&large, font_size(&large, 0.0), 0.0),
            MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE
        );
        // Direct Rust DTO lengths remain logical pixels; Web numbers arrive as CSS strings.
        assert_eq!(
            line_height(
                &RichTextStyle {
                    line_height: Some(1.5.into()),
                    ..Default::default()
                },
                20.0,
                0.0
            ),
            1.5
        );
    }
}
