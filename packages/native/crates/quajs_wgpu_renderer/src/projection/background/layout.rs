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

    let parts = normalized.split_whitespace().collect::<Vec<_>>();
    if let Some(origin) = resolved_media_origin(&parts) {
        return origin;
    }

    for part in parts {
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

fn resolved_media_origin(parts: &[&str]) -> Option<MediaOrigin> {
    match parts {
        [single] => parse_horizontal_position(single)
            .map(|x| MediaOrigin { x, y: 0.5 })
            .or_else(|| parse_vertical_position(single).map(|y| MediaOrigin { x: 0.5, y })),
        [x, y] => {
            let horizontal = parse_horizontal_position(x);
            let vertical = parse_vertical_position(y);
            if let (Some(x), Some(y)) = (horizontal, vertical) {
                return Some(MediaOrigin { x, y });
            }

            let horizontal = parse_horizontal_position(y);
            let vertical = parse_vertical_position(x);
            match (horizontal, vertical) {
                (Some(x), Some(y)) => Some(MediaOrigin { x, y }),
                _ => None,
            }
        }
        _ => None,
    }
}

fn parse_horizontal_position(value: &str) -> Option<f64> {
    match value {
        "left" => Some(0.0),
        "center" => Some(0.5),
        "right" => Some(1.0),
        _ => parse_percent_position(value),
    }
}

fn parse_vertical_position(value: &str) -> Option<f64> {
    match value {
        "top" => Some(0.0),
        "center" => Some(0.5),
        "bottom" => Some(1.0),
        _ => parse_percent_position(value),
    }
}

fn parse_percent_position(value: &str) -> Option<f64> {
    let number = value.strip_suffix('%')?.parse::<f64>().ok()?;
    if number.is_finite() && (0.0..=100.0).contains(&number) {
        Some(number / 100.0)
    } else {
        None
    }
}
