use crate::projection::common::is_safe_native_asset_ref;
use crate::projection::safety::{
    is_safe_native_color_literal, is_safe_native_opacity, is_safe_native_ui_style_logical_value,
};
use crate::projection::typography::{font_family_to_draw_param, font_weight_to_draw_param};
use crate::render_graph::{
    EdgeInsetsDrawParam, FontStyleDrawParam, FontWeightDrawParam, MediaFit, MediaOrigin, TextAlign,
    TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam, WhiteSpaceDrawParam,
};

use super::types::{
    UiSurfaceBorderStyleProjection, UiSurfaceFontStyleProjection, UiSurfaceImageProjection,
    UiSurfaceObjectFitProjection, UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection,
    UiSurfaceTextDecorationProjection, UiSurfaceTextOverflowProjection,
    UiSurfaceTextTransformProjection, UiSurfaceWhiteSpaceProjection,
};

pub fn resolve_background_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    style
        .background_color
        .as_deref()
        .filter(|value| is_safe_native_color_literal(value))
        .unwrap_or(fallback)
        .to_string()
}

pub fn resolve_background_image(
    style: &UiSurfaceResolvedStyle,
) -> Option<&UiSurfaceImageProjection> {
    style
        .background_image
        .as_ref()
        .filter(|image| is_safe_native_asset_ref(&image.asset_type, &image.asset_name))
}

pub fn resolve_background_size(style: &UiSurfaceResolvedStyle, fallback: MediaFit) -> MediaFit {
    media_fit_from_projection(style.background_size, fallback)
}

pub fn resolve_background_position(
    style: &UiSurfaceResolvedStyle,
    fallback: MediaOrigin,
) -> MediaOrigin {
    style
        .background_position
        .filter(|position| (0.0..=1.0).contains(&position.x) && (0.0..=1.0).contains(&position.y))
        .map(|position| MediaOrigin {
            x: position.x,
            y: position.y,
        })
        .unwrap_or(fallback)
}

pub fn resolve_text_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    style
        .color
        .as_deref()
        .filter(|value| is_safe_native_color_literal(value))
        .unwrap_or(fallback)
        .to_string()
}

pub fn resolve_border_radius(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.border_radius, fallback)
}

pub fn resolve_border_color(style: &UiSurfaceResolvedStyle) -> Option<String> {
    if matches!(
        style.border_style,
        Some(UiSurfaceBorderStyleProjection::None)
    ) {
        return None;
    }

    style
        .border_color
        .as_deref()
        .filter(|value| is_safe_native_color_literal(value))
        .map(str::to_string)
}

pub fn resolve_border_width(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    if matches!(
        style.border_style,
        Some(UiSurfaceBorderStyleProjection::None)
    ) {
        return 0.0;
    }

    resolve_positive_number(style.border_width, fallback)
}

pub fn resolve_font_size(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.font_size, fallback)
}

pub fn resolve_font_family(style: &UiSurfaceResolvedStyle) -> Vec<String> {
    font_family_to_draw_param(&style.font_family)
}

pub fn resolve_font_style(style: &UiSurfaceResolvedStyle) -> FontStyleDrawParam {
    match style.font_style {
        Some(UiSurfaceFontStyleProjection::Italic) => FontStyleDrawParam::Italic,
        Some(UiSurfaceFontStyleProjection::Normal) | None => FontStyleDrawParam::Normal,
    }
}

pub fn resolve_font_weight(style: &UiSurfaceResolvedStyle) -> Option<FontWeightDrawParam> {
    font_weight_to_draw_param(&style.font_weight)
}

pub fn resolve_letter_spacing(style: &UiSurfaceResolvedStyle) -> f64 {
    resolve_positive_number(style.letter_spacing, 0.0)
}

pub fn resolve_line_height(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.line_height, fallback)
}

pub fn resolve_text_align(style: &UiSurfaceResolvedStyle, fallback: TextAlign) -> TextAlign {
    match style.text_align {
        Some(UiSurfaceTextAlignProjection::Left) => TextAlign::Left,
        Some(UiSurfaceTextAlignProjection::Center) => TextAlign::Center,
        Some(UiSurfaceTextAlignProjection::Right) => TextAlign::Right,
        Some(UiSurfaceTextAlignProjection::Justify) => TextAlign::Justify,
        None => fallback,
    }
}

pub fn resolve_text_decoration(style: &UiSurfaceResolvedStyle) -> TextDecorationDrawParam {
    match style.text_decoration {
        Some(UiSurfaceTextDecorationProjection::Underline) => TextDecorationDrawParam::Underline,
        Some(UiSurfaceTextDecorationProjection::LineThrough) => {
            TextDecorationDrawParam::LineThrough
        }
        Some(UiSurfaceTextDecorationProjection::None) | None => TextDecorationDrawParam::None,
    }
}

pub fn resolve_text_overflow(style: &UiSurfaceResolvedStyle) -> TextOverflowDrawParam {
    match style.text_overflow {
        Some(UiSurfaceTextOverflowProjection::Ellipsis) => TextOverflowDrawParam::Ellipsis,
        Some(UiSurfaceTextOverflowProjection::Clip) | None => TextOverflowDrawParam::Clip,
    }
}

pub fn resolve_text_transform(style: &UiSurfaceResolvedStyle) -> TextTransformDrawParam {
    match style.text_transform {
        Some(UiSurfaceTextTransformProjection::Uppercase) => TextTransformDrawParam::Uppercase,
        Some(UiSurfaceTextTransformProjection::Lowercase) => TextTransformDrawParam::Lowercase,
        Some(UiSurfaceTextTransformProjection::Capitalize) => TextTransformDrawParam::Capitalize,
        Some(UiSurfaceTextTransformProjection::None) | None => TextTransformDrawParam::None,
    }
}

pub fn resolve_white_space(style: &UiSurfaceResolvedStyle) -> WhiteSpaceDrawParam {
    match style.white_space {
        Some(UiSurfaceWhiteSpaceProjection::Nowrap) => WhiteSpaceDrawParam::NoWrap,
        Some(UiSurfaceWhiteSpaceProjection::Pre) => WhiteSpaceDrawParam::Pre,
        Some(UiSurfaceWhiteSpaceProjection::PreLine) => WhiteSpaceDrawParam::PreLine,
        Some(UiSurfaceWhiteSpaceProjection::PreWrap) => WhiteSpaceDrawParam::PreWrap,
        Some(UiSurfaceWhiteSpaceProjection::Normal) | None => WhiteSpaceDrawParam::Normal,
    }
}

pub fn resolve_object_fit(style: &UiSurfaceResolvedStyle, fallback: MediaFit) -> MediaFit {
    media_fit_from_projection(style.object_fit, fallback)
}

fn media_fit_from_projection(
    value: Option<UiSurfaceObjectFitProjection>,
    fallback: MediaFit,
) -> MediaFit {
    match value {
        Some(UiSurfaceObjectFitProjection::Cover) => MediaFit::Cover,
        Some(UiSurfaceObjectFitProjection::Contain) => MediaFit::Contain,
        Some(UiSurfaceObjectFitProjection::Fill) => MediaFit::Fill,
        Some(UiSurfaceObjectFitProjection::None) => MediaFit::None,
        Some(UiSurfaceObjectFitProjection::ScaleDown) => MediaFit::ScaleDown,
        None => fallback,
    }
}

pub fn resolve_opacity(style: &UiSurfaceResolvedStyle, fallback: f32) -> f32 {
    style
        .opacity
        .filter(|number| is_safe_native_opacity(*number))
        .unwrap_or(fallback)
}

pub fn resolve_padding(style: &UiSurfaceResolvedStyle) -> EdgeInsetsDrawParam {
    let Some(padding) = style.padding else {
        return EdgeInsetsDrawParam::default();
    };

    EdgeInsetsDrawParam {
        top: resolve_edge_inset(padding.top),
        right: resolve_edge_inset(padding.right),
        bottom: resolve_edge_inset(padding.bottom),
        left: resolve_edge_inset(padding.left),
    }
}

fn resolve_positive_number(value: Option<f64>, fallback: f64) -> f64 {
    value
        .filter(|number| is_safe_native_ui_style_logical_value(*number))
        .unwrap_or(fallback)
}

fn resolve_edge_inset(value: f64) -> f64 {
    if is_safe_native_ui_style_logical_value(value) {
        value
    } else {
        0.0
    }
}
