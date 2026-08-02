use serde::{Deserialize, Serialize};

use crate::projection::common::{FontFamilyProjection, FontWeightProjection};
use crate::projection::ui::types::{default_one_f64, is_one_f64_ref, is_zero_f64};

use super::UiSurfaceImageProjection;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTextAlignProjection {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTextDecorationProjection {
    None,
    Underline,
    LineThrough,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTextOverflowProjection {
    Clip,
    Ellipsis,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTextTransformProjection {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceWhiteSpaceProjection {
    Normal,
    Nowrap,
    Pre,
    PreLine,
    PreWrap,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceFontStyleProjection {
    Normal,
    Italic,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceObjectFitProjection {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceBorderStyleProjection {
    None,
    Solid,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceBackgroundPositionProjection {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceEdgeInsetsProjection {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceShadowProjection {
    pub offset_x: f64,
    pub offset_y: f64,
    #[serde(default)]
    pub blur_radius: f64,
    #[serde(default)]
    pub spread_radius: f64,
    pub color: String,
    #[serde(default)]
    pub inset: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceGradientKindProjection {
    Linear,
    Radial,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceRadialGradientShapeProjection {
    Circle,
    Ellipse,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceGradientProjection {
    pub kind: UiSurfaceGradientKindProjection,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub angle_degrees: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub center_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub center_y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<UiSurfaceRadialGradientShapeProjection>,
    /// Ordered resolved color stops. The native bridge requires 2..=8 stops.
    pub stops: Vec<UiSurfaceGradientStopProjection>,
}

/// A single color stop in a multi-stop gradient.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceGradientStopProjection {
    pub color: String,
    /// Normalized position 0.0–1.0 along the gradient line/radius.
    pub position: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceFilterProjection {
    #[serde(default)]
    pub brightness: f64,
    #[serde(default)]
    pub saturate: f64,
    /// CSS `blur(Npx)` — Gaussian blur radius in logical pixels.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub blur: f64,
    /// CSS `contrast(N)` — multiplicative contrast factor; 1.0 = unchanged.
    #[serde(default = "default_one_f64", skip_serializing_if = "is_one_f64_ref")]
    pub contrast: f64,
    /// CSS `grayscale(N)` — 0.0 = full color, 1.0 = fully grayscale.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub grayscale: f64,
    /// CSS `sepia(N)` — 0.0 = unchanged, 1.0 = fully sepia.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub sepia: f64,
    /// CSS `hue-rotate(Ndeg)` — degrees to shift the hue wheel.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub hue_rotate: f64,
    /// CSS `invert(N)` — 0.0 = unchanged, 1.0 = fully inverted.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub invert: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurfaceTransitionPropertyProjection {
    All,
    BackgroundColor,
    BorderColor,
    BoxShadow,
    Color,
    Filter,
    Opacity,
    Scale,
    Transform,
    Translate,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum UiSurfaceTransitionEasingProjection {
    Ease,
    EaseIn,
    EaseInOut,
    EaseOut,
    Linear,
    /// `cubic-bezier(x1, y1, x2, y2)` control points, matching the CSS
    /// `transition-timing-function` form. The x coordinates must be normalized
    /// to `0..=1` like CSS requires; y may overshoot.
    CubicBezier([f64; 4]),
}

impl UiSurfaceTransitionEasingProjection {
    fn as_keyword(&self) -> Option<&'static str> {
        match self {
            Self::Ease => Some("ease"),
            Self::EaseIn => Some("ease-in"),
            Self::EaseInOut => Some("ease-in-out"),
            Self::EaseOut => Some("ease-out"),
            Self::Linear => Some("linear"),
            Self::CubicBezier(_) => None,
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "ease" => return Some(Self::Ease),
            "ease-in" => return Some(Self::EaseIn),
            "ease-in-out" => return Some(Self::EaseInOut),
            "ease-out" => return Some(Self::EaseOut),
            "linear" => return Some(Self::Linear),
            _ => {}
        }
        let body = value.strip_prefix("cubic-bezier(")?.strip_suffix(')')?;
        let mut points = [0.0f64; 4];
        let mut count = 0;
        for part in body.split(',') {
            if count >= 4 {
                return None;
            }
            points[count] = part.trim().parse::<f64>().ok().filter(|v| v.is_finite())?;
            count += 1;
        }
        if count != 4 {
            return None;
        }
        // CSS requires the x control points inside the unit interval so the
        // curve stays a function of time.
        if !(0.0..=1.0).contains(&points[0]) || !(0.0..=1.0).contains(&points[2]) {
            return None;
        }
        Some(Self::CubicBezier(points))
    }
}

impl Serialize for UiSurfaceTransitionEasingProjection {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.as_keyword() {
            Some(keyword) => serializer.serialize_str(keyword),
            None => {
                let Self::CubicBezier([x1, y1, x2, y2]) = self else {
                    unreachable!("keyword variants serialized above")
                };
                serializer.serialize_str(&format!("cubic-bezier({x1}, {y1}, {x2}, {y2})"))
            }
        }
    }
}

impl<'de> Deserialize<'de> for UiSurfaceTransitionEasingProjection {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).ok_or_else(|| {
            serde::de::Error::custom(format!(
                "unsupported native UI transition easing `{value}`; expected ease, ease-in, ease-in-out, ease-out, linear, or cubic-bezier(x1, y1, x2, y2) with x coordinates in 0..=1"
            ))
        })
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceTransitionProjection {
    pub property: UiSurfaceTransitionPropertyProjection,
    pub duration_ms: f64,
    pub easing: UiSurfaceTransitionEasingProjection,
    /// CSS `transition-delay`. Held-back time before the curve starts; the
    /// transition is still considered active during the delay so the renderer
    /// keeps requesting frames. Defaults to 0 for engine-authored projections.
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub delay_ms: f64,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceResolvedStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_gradient: Option<UiSurfaceGradientProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_image: Option<UiSurfaceImageProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_position: Option<UiSurfaceBackgroundPositionProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_size: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<UiSurfaceFilterProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_top_left_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_top_right_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_bottom_right_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_bottom_left_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_top_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_right_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_bottom_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_left_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_style: Option<UiSurfaceBorderStyleProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_top_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_right_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_bottom_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_left_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_shadow: Option<UiSurfaceShadowProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<FontFamilyProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_style: Option<UiSurfaceFontStyleProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeightProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<UiSurfaceTextAlignProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<UiSurfaceTextDecorationProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_overflow: Option<UiSurfaceTextOverflowProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_transform: Option<UiSurfaceTextTransformProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_shadow: Option<UiSurfaceShadowProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub white_space: Option<UiSurfaceWhiteSpaceProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_fit: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_position: Option<UiSurfaceBackgroundPositionProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<UiSurfaceEdgeInsetsProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotate_deg: Option<f64>,
}

#[cfg(test)]
mod easing_tests {
    use super::UiSurfaceTransitionEasingProjection;

    #[test]
    fn parses_keywords_and_css_cubic_bezier_strings() {
        let parsed: UiSurfaceTransitionEasingProjection =
            serde_json::from_str("\"ease-in-out\"").unwrap();
        assert_eq!(parsed, UiSurfaceTransitionEasingProjection::EaseInOut);

        let parsed: UiSurfaceTransitionEasingProjection =
            serde_json::from_str("\"cubic-bezier(0.19, 1, 0.22, 1)\"").unwrap();
        assert_eq!(
            parsed,
            UiSurfaceTransitionEasingProjection::CubicBezier([0.19, 1.0, 0.22, 1.0])
        );
        // Round-trips through the same CSS string form.
        assert_eq!(
            serde_json::to_string(&parsed).unwrap(),
            "\"cubic-bezier(0.19, 1, 0.22, 1)\""
        );
        assert_eq!(
            serde_json::to_string(&UiSurfaceTransitionEasingProjection::EaseOut).unwrap(),
            "\"ease-out\""
        );
    }

    #[test]
    fn rejects_malformed_or_non_css_bezier_strings() {
        for value in [
            "\"bounce\"",
            "\"cubic-bezier(0.19, 1, 0.22)\"",
            "\"cubic-bezier(0.19, 1, 0.22, 1, 2)\"",
            // x control points must stay inside the unit interval per CSS.
            "\"cubic-bezier(-0.1, 1, 0.22, 1)\"",
            "\"cubic-bezier(0.19, 1, 1.22, 1)\"",
            "\"cubic-bezier(nan, 1, 0.22, 1)\"",
        ] {
            assert!(
                serde_json::from_str::<UiSurfaceTransitionEasingProjection>(value).is_err(),
                "expected `{value}` to be rejected"
            );
        }
    }
}
