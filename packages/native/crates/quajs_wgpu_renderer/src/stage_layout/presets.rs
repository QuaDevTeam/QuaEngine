use super::resolve::{clamp, positive_number};
use super::types::{
    ViewLayoutInput, ViewLayoutOrientation, ViewLayoutProjection, ViewLayoutScaleMode,
};

pub fn landscape_layout() -> ViewLayoutProjection {
    ViewLayoutProjection {
        orientation: ViewLayoutOrientation::Landscape,
        width: 1920.0,
        height: 1080.0,
        aspect_ratio: 16.0 / 9.0,
        min_aspect_ratio: 16.0 / 10.0,
        max_aspect_ratio: 16.0 / 9.0,
        scale_mode: ViewLayoutScaleMode::Fit,
    }
}

pub fn portrait_layout() -> ViewLayoutProjection {
    ViewLayoutProjection {
        orientation: ViewLayoutOrientation::Portrait,
        width: 1080.0,
        height: 2340.0,
        aspect_ratio: 9.0 / 19.5,
        min_aspect_ratio: 9.0 / 21.0,
        max_aspect_ratio: 9.0 / 16.0,
        scale_mode: ViewLayoutScaleMode::Fit,
    }
}

pub fn create_view_layout_projection(input: Option<ViewLayoutInput>) -> ViewLayoutProjection {
    let input = input.unwrap_or_default();
    let base = match input.preset.or(input.orientation) {
        Some(ViewLayoutOrientation::Portrait) => portrait_layout(),
        Some(ViewLayoutOrientation::Landscape) | None => landscape_layout(),
    };
    let width = positive_number(input.width, base.width);
    let height = positive_number(input.height, base.height);
    let preferred_aspect_ratio = positive_number(input.aspect_ratio, width / height);
    let mut min_aspect_ratio = positive_number(input.min_aspect_ratio, base.min_aspect_ratio);
    let mut max_aspect_ratio = positive_number(input.max_aspect_ratio, base.max_aspect_ratio);

    if min_aspect_ratio > max_aspect_ratio {
        std::mem::swap(&mut min_aspect_ratio, &mut max_aspect_ratio);
    }

    ViewLayoutProjection {
        orientation: base.orientation,
        width,
        height,
        aspect_ratio: clamp(preferred_aspect_ratio, min_aspect_ratio, max_aspect_ratio),
        min_aspect_ratio,
        max_aspect_ratio,
        scale_mode: input.scale_mode.unwrap_or(base.scale_mode),
    }
}
