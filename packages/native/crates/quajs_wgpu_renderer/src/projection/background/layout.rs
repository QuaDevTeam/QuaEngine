use crate::render_graph::{LogicalRect, MediaFit, MediaOrigin};
use crate::stage_layout::ResolvedStageLayout;

use super::types::BackgroundFit;

pub fn full_stage_rect(layout: &ResolvedStageLayout) -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: layout.logical_width,
        height: layout.logical_height,
    }
}

pub fn resolve_background_bounds(
    layout: &ResolvedStageLayout,
    x: f64,
    y: f64,
    width: Option<f64>,
    height: Option<f64>,
    scale: f64,
) -> LogicalRect {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    LogicalRect {
        x,
        y,
        width: width.unwrap_or(layout.logical_width) * scale,
        height: height.unwrap_or(layout.logical_height) * scale,
    }
}

pub fn media_fit(fit: BackgroundFit) -> MediaFit {
    match fit {
        BackgroundFit::Cover => MediaFit::Cover,
        BackgroundFit::Contain => MediaFit::Contain,
        BackgroundFit::Fill => MediaFit::Fill,
        BackgroundFit::None => MediaFit::None,
        BackgroundFit::ScaleDown => MediaFit::ScaleDown,
    }
}

pub fn media_origin(origin: Option<&str>) -> MediaOrigin {
    let Some(origin) = origin else {
        return MediaOrigin::default();
    };
    let normalized = origin.trim().to_ascii_lowercase();
    let mut x = 0.5;
    let mut y = 0.5;

    for part in normalized.split_whitespace() {
        match part {
            "left" => x = 0.0,
            "right" => x = 1.0,
            "top" => y = 0.0,
            "bottom" => y = 1.0,
            "center" => {}
            _ => {}
        }
    }

    MediaOrigin { x, y }
}
