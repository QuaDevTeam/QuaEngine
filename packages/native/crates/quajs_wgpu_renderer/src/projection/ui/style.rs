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
    UiSurfaceBackgroundPositionProjection, UiSurfaceBorderStyleProjection,
    UiSurfaceFontStyleProjection, UiSurfaceImageProjection, UiSurfaceObjectFitProjection,
    UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection, UiSurfaceTextDecorationProjection,
    UiSurfaceTextOverflowProjection, UiSurfaceTextTransformProjection,
    UiSurfaceWhiteSpaceProjection,
};

pub fn resolve_background_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    if style.background_gradient.is_some() {
        return "transparent".to_string();
    }
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
    resolve_media_origin(style.background_position, fallback)
}

/// Returns `(brightness, saturation, contrast, grayscale, sepia, hue_rotate_radians, invert)`.
/// All values are clamped to sensible CSS ranges.
pub fn resolve_image_filter(style: &UiSurfaceResolvedStyle) -> (f64, f64, f64, f64, f64, f64, f64) {
    style
        .filter
        .map(|filter| (
            filter.brightness.clamp(0.0, 8.0),
            filter.saturate.clamp(0.0, 8.0),
            filter.contrast.clamp(0.0, 8.0),
            filter.grayscale.clamp(0.0, 1.0),
            filter.sepia.clamp(0.0, 1.0),
            filter.hue_rotate.to_radians(),
            filter.invert.clamp(0.0, 1.0),
        ))
        .unwrap_or((1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0))
}

pub fn resolve_text_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    style
        .color
        .as_deref()
        .filter(|value| is_safe_native_color_literal(value))
        .unwrap_or(fallback)
        .to_string()
}

/// Collapses the four corners to the single radius the GPU params currently
/// carry. Per-corner radii are preserved by [`resolve_corner_radii`]; until the
/// shader consumes them, the largest corner keeps rounded shapes from silently
/// squaring off. `fallback` applies only when no radius is specified at all.
pub fn resolve_border_radius(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    corner_radii_with_base(
        style,
        resolve_positive_number(style.border_radius, fallback),
    )
    .into_iter()
    .fold(f64::NEG_INFINITY, f64::max)
}

/// Returns `[top_left, top_right, bottom_right, bottom_left]` in logical
/// pixels. Each corner falls back to `border-radius`, then `0.0`.
pub fn resolve_corner_radii(style: &UiSurfaceResolvedStyle) -> [f64; 4] {
    corner_radii_with_base(style, resolve_positive_number(style.border_radius, 0.0))
}

/// Resolves the CSS `rotate()` angle applied to a node's draw quad.
///
/// The value arrives from untrusted projection JSON, so non-finite angles are
/// dropped rather than forwarded to vertex math. Finite angles are wrapped into
/// `-360.0..360.0` so a runaway animated value cannot grow without bound.
pub fn resolve_rotate_deg(style: &UiSurfaceResolvedStyle) -> f64 {
    style
        .rotate_deg
        .filter(|degrees| degrees.is_finite())
        .map(|degrees| degrees % 360.0)
        .unwrap_or(0.0)
}

fn corner_radii_with_base(style: &UiSurfaceResolvedStyle, base: f64) -> [f64; 4] {
    [
        resolve_positive_number(style.border_top_left_radius, base),
        resolve_positive_number(style.border_top_right_radius, base),
        resolve_positive_number(style.border_bottom_right_radius, base),
        resolve_positive_number(style.border_bottom_left_radius, base),
    ]
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

/// CSS border edges in side order (top, right, bottom, left). Per-side values
/// override the shorthand for their side; unspecified sides fall back to
/// `border-width` / `border-color`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResolvedBorderEdges {
    pub widths: [f64; 4],
    pub colors: [Option<String>; 4],
}

/// Returns `Some` when any per-side border width or color is specified, which
/// switches the node from the single shader border to per-edge draw commands.
/// `border-style: none` suppresses every edge.
pub fn resolve_border_edges(style: &UiSurfaceResolvedStyle) -> Option<ResolvedBorderEdges> {
    let has_per_side = style.border_top_width.is_some()
        || style.border_right_width.is_some()
        || style.border_bottom_width.is_some()
        || style.border_left_width.is_some()
        || style.border_top_color.is_some()
        || style.border_right_color.is_some()
        || style.border_bottom_color.is_some()
        || style.border_left_color.is_some();
    if !has_per_side {
        return None;
    }
    if matches!(
        style.border_style,
        Some(UiSurfaceBorderStyleProjection::None)
    ) {
        return Some(ResolvedBorderEdges::default());
    }

    let base_width = resolve_positive_number(style.border_width, 0.0);
    let base_color = style
        .border_color
        .as_deref()
        .filter(|value| is_safe_native_color_literal(value));
    let side_color = |color: Option<&str>| {
        color
            .filter(|value| is_safe_native_color_literal(value))
            .or(base_color)
            .map(str::to_string)
    };
    Some(ResolvedBorderEdges {
        widths: [
            resolve_positive_number(style.border_top_width, base_width),
            resolve_positive_number(style.border_right_width, base_width),
            resolve_positive_number(style.border_bottom_width, base_width),
            resolve_positive_number(style.border_left_width, base_width),
        ],
        colors: [
            side_color(style.border_top_color.as_deref()),
            side_color(style.border_right_color.as_deref()),
            side_color(style.border_bottom_color.as_deref()),
            side_color(style.border_left_color.as_deref()),
        ],
    })
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

pub fn resolve_object_position(
    style: &UiSurfaceResolvedStyle,
    fallback: MediaOrigin,
) -> MediaOrigin {
    resolve_media_origin(style.object_position, fallback)
}

fn resolve_media_origin(
    value: Option<UiSurfaceBackgroundPositionProjection>,
    fallback: MediaOrigin,
) -> MediaOrigin {
    value
        .filter(|position| (0.0..=1.0).contains(&position.x) && (0.0..=1.0).contains(&position.y))
        .map(|position| MediaOrigin {
            x: position.x,
            y: position.y,
        })
        .unwrap_or(fallback)
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

#[cfg(test)]
mod corner_and_rotation_tests {
    use super::*;

    fn style() -> UiSurfaceResolvedStyle {
        UiSurfaceResolvedStyle::default()
    }

    #[test]
    fn corner_radii_fall_back_to_uniform_border_radius() {
        let mut style = style();
        style.border_radius = Some(12.0);
        assert_eq!(resolve_corner_radii(&style), [12.0, 12.0, 12.0, 12.0]);
        assert_eq!(resolve_border_radius(&style, 0.0), 12.0);
    }

    #[test]
    fn per_corner_radii_override_uniform_in_css_order() {
        let mut style = style();
        style.border_radius = Some(4.0);
        style.border_top_left_radius = Some(1.0);
        style.border_top_right_radius = Some(2.0);
        style.border_bottom_right_radius = Some(3.0);
        style.border_bottom_left_radius = Some(8.0);
        // `[top_left, top_right, bottom_right, bottom_left]`.
        assert_eq!(resolve_corner_radii(&style), [1.0, 2.0, 3.0, 8.0]);
        // The collapsed GPU value keeps the largest corner so a rounded shape
        // does not silently square off before the shader reads all four.
        assert_eq!(resolve_border_radius(&style, 0.0), 8.0);
    }

    #[test]
    fn unspecified_radius_uses_caller_fallback() {
        assert_eq!(resolve_border_radius(&style(), 9.0), 9.0);
        assert_eq!(resolve_corner_radii(&style()), [0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn a_single_corner_leaves_the_others_square() {
        let mut style = style();
        style.border_top_left_radius = Some(6.0);
        assert_eq!(resolve_corner_radii(&style), [6.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn rotation_normalizes_and_rejects_unsafe_values() {
        let mut style = style();
        assert_eq!(resolve_rotate_deg(&style), 0.0);

        style.rotate_deg = Some(30.0);
        assert_eq!(resolve_rotate_deg(&style), 30.0);

        style.rotate_deg = Some(-45.0);
        assert_eq!(resolve_rotate_deg(&style), -45.0);

        // Wraps into a single turn rather than accumulating unbounded spin.
        style.rotate_deg = Some(450.0);
        assert_eq!(resolve_rotate_deg(&style), 90.0);

        for unsafe_value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            style.rotate_deg = Some(unsafe_value);
            assert_eq!(resolve_rotate_deg(&style), 0.0);
        }
    }
}
