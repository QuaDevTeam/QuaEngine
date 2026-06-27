use crate::stage_layout::{StageContainerInput, StageSafeAreaInsets, ViewLayoutInput};

const MAX_NATIVE_STAGE_DIMENSION: f64 = 1_000_000.0;
const MAX_NATIVE_STAGE_ASPECT_RATIO: f64 = 1_000.0;
const MAX_NATIVE_DEVICE_PIXEL_RATIO: f64 = 64.0;
const MAX_NATIVE_SAFE_AREA_INSET: f64 = 1_000_000.0;

pub(super) fn invalid_native_json_layout_reason(
    layout: Option<&ViewLayoutInput>,
) -> Option<(&'static str, String, String)> {
    let layout = layout?;
    validate_positive_dimension("width", layout.width)
        .or_else(|| validate_positive_dimension("height", layout.height))
        .or_else(|| validate_aspect_ratio("aspectRatio", layout.aspect_ratio))
        .or_else(|| validate_aspect_ratio("minAspectRatio", layout.min_aspect_ratio))
        .or_else(|| validate_aspect_ratio("maxAspectRatio", layout.max_aspect_ratio))
        .or_else(|| validate_aspect_interval(layout.min_aspect_ratio, layout.max_aspect_ratio))
}

pub(super) fn invalid_native_json_container_reason(
    container: Option<&StageContainerInput>,
) -> Option<(&'static str, String, String)> {
    let container = container?;
    validate_positive_dimension("width", container.width)
        .or_else(|| validate_positive_dimension("height", container.height))
        .or_else(|| validate_device_pixel_ratio(container.device_pixel_ratio))
        .or_else(|| validate_safe_area_insets(container.safe_area_insets))
}

fn validate_positive_dimension(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "native renderer stage dimensions must be finite values".to_string(),
        ));
    }
    if value <= 0.0 {
        return Some((
            field,
            value.to_string(),
            "native renderer stage dimensions must be greater than 0".to_string(),
        ));
    }
    if value > MAX_NATIVE_STAGE_DIMENSION {
        return Some((
            field,
            value.to_string(),
            "native renderer stage dimensions exceed logical limits".to_string(),
        ));
    }
    None
}

fn validate_aspect_ratio(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "native renderer layout aspect ratios must be finite values".to_string(),
        ));
    }
    if value <= 0.0 {
        return Some((
            field,
            value.to_string(),
            "native renderer layout aspect ratios must be greater than 0".to_string(),
        ));
    }
    if value > MAX_NATIVE_STAGE_ASPECT_RATIO {
        return Some((
            field,
            value.to_string(),
            "native renderer layout aspect ratios exceed native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_aspect_interval(
    min_aspect_ratio: Option<f64>,
    max_aspect_ratio: Option<f64>,
) -> Option<(&'static str, String, String)> {
    let (Some(min), Some(max)) = (min_aspect_ratio, max_aspect_ratio) else {
        return None;
    };
    if !min.is_finite() || !max.is_finite() || min <= 0.0 || max <= 0.0 {
        return None;
    }
    if min > max {
        return Some((
            "minAspectRatio",
            min.to_string(),
            "native renderer layout minAspectRatio must not exceed maxAspectRatio".to_string(),
        ));
    }
    None
}

fn validate_device_pixel_ratio(value: Option<f64>) -> Option<(&'static str, String, String)> {
    let value = value?;
    if !value.is_finite() {
        return Some((
            "devicePixelRatio",
            value.to_string(),
            "native renderer devicePixelRatio must be finite".to_string(),
        ));
    }
    if value <= 0.0 {
        return Some((
            "devicePixelRatio",
            value.to_string(),
            "native renderer devicePixelRatio must be greater than 0".to_string(),
        ));
    }
    if value > MAX_NATIVE_DEVICE_PIXEL_RATIO {
        return Some((
            "devicePixelRatio",
            value.to_string(),
            "native renderer devicePixelRatio exceeds native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_safe_area_insets(
    insets: Option<StageSafeAreaInsets>,
) -> Option<(&'static str, String, String)> {
    let insets = insets?;
    validate_safe_area_inset("safeAreaInsets.top", insets.top)
        .or_else(|| validate_safe_area_inset("safeAreaInsets.right", insets.right))
        .or_else(|| validate_safe_area_inset("safeAreaInsets.bottom", insets.bottom))
        .or_else(|| validate_safe_area_inset("safeAreaInsets.left", insets.left))
}

fn validate_safe_area_inset(
    field: &'static str,
    value: f64,
) -> Option<(&'static str, String, String)> {
    if !value.is_finite() {
        return Some((
            field,
            value.to_string(),
            "native renderer safe-area insets must be finite".to_string(),
        ));
    }
    if value < 0.0 {
        return Some((
            field,
            value.to_string(),
            "native renderer safe-area insets must not be negative".to_string(),
        ));
    }
    if value > MAX_NATIVE_SAFE_AREA_INSET {
        return Some((
            field,
            value.to_string(),
            "native renderer safe-area insets exceed native renderer limits".to_string(),
        ));
    }
    None
}
