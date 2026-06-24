use crate::projection::typography::{font_family_to_draw_param, font_weight_to_draw_param};
use crate::render_graph::{FontWeightDrawParam, MediaFit, TextAlign};

use super::types::{
    UiSurfaceObjectFitProjection, UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection,
};

pub fn resolve_background_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    style
        .background_color
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub fn resolve_text_color(style: &UiSurfaceResolvedStyle, fallback: &str) -> String {
    style
        .color
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub fn resolve_border_radius(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.border_radius, fallback)
}

pub fn resolve_border_color(style: &UiSurfaceResolvedStyle) -> Option<String> {
    style
        .border_color
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
}

pub fn resolve_border_width(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.border_width, fallback)
}

pub fn resolve_font_size(style: &UiSurfaceResolvedStyle, fallback: f64) -> f64 {
    resolve_positive_number(style.font_size, fallback)
}

pub fn resolve_font_family(style: &UiSurfaceResolvedStyle) -> Vec<String> {
    font_family_to_draw_param(&style.font_family)
}

pub fn resolve_font_weight(style: &UiSurfaceResolvedStyle) -> Option<FontWeightDrawParam> {
    font_weight_to_draw_param(&style.font_weight)
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

pub fn resolve_object_fit(style: &UiSurfaceResolvedStyle, fallback: MediaFit) -> MediaFit {
    match style.object_fit {
        Some(UiSurfaceObjectFitProjection::Cover) => MediaFit::Cover,
        Some(UiSurfaceObjectFitProjection::Contain) => MediaFit::Contain,
        Some(UiSurfaceObjectFitProjection::Fill) => MediaFit::Fill,
        Some(UiSurfaceObjectFitProjection::None) => MediaFit::None,
        Some(UiSurfaceObjectFitProjection::ScaleDown) => MediaFit::ScaleDown,
        None => fallback,
    }
}

fn resolve_positive_number(value: Option<f64>, fallback: f64) -> f64 {
    value
        .filter(|number| number.is_finite() && *number >= 0.0)
        .unwrap_or(fallback)
}
