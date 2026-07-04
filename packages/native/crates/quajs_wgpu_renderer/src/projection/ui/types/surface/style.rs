use serde::{Deserialize, Serialize};

use crate::projection::common::{FontFamilyProjection, FontWeightProjection};

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

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceResolvedStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_image: Option<UiSurfaceImageProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_position: Option<UiSurfaceBackgroundPositionProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_size: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_style: Option<UiSurfaceBorderStyleProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
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
    pub white_space: Option<UiSurfaceWhiteSpaceProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_fit: Option<UiSurfaceObjectFitProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<UiSurfaceEdgeInsetsProjection>,
}
