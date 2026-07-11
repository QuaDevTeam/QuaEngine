use crate::render_graph::{CharacterAnchor, LogicalRect};
use crate::stage_layout::ResolvedStageLayout;

use super::types::CharacterPosition;

const DEFAULT_CHARACTER_WIDTH_RATIO: f64 = 500.0 / 1080.0;
const DEFAULT_CHARACTER_HEIGHT_RATIO: f64 = 750.0 / 1080.0;

pub fn resolve_character_anchor(position: &CharacterPosition) -> CharacterAnchor {
    if let Some(anchor) = position.anchor.as_deref().map(str::trim) {
        match anchor {
            "left" => return CharacterAnchor::Left,
            "right" => return CharacterAnchor::Right,
            "center" => return CharacterAnchor::Center,
            _ => {}
        }
    }

    if position
        .x_percent
        .is_some_and(|x| x.is_finite() && x <= 12.0)
        || position.x.is_some_and(|x| x.is_finite() && x <= 240.0)
    {
        return CharacterAnchor::Left;
    }

    if position
        .x_percent
        .is_some_and(|x| x.is_finite() && x >= 88.0)
        || position.x.is_some_and(|x| x.is_finite() && x >= 1680.0)
    {
        return CharacterAnchor::Right;
    }

    CharacterAnchor::Center
}

pub fn resolve_character_bounds(
    layout: &ResolvedStageLayout,
    position: &CharacterPosition,
) -> LogicalRect {
    let scale = position
        .scale
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    let width = position
        .width
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(layout.logical_height * DEFAULT_CHARACTER_WIDTH_RATIO)
        * scale;
    let height = position
        .height
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(layout.logical_height * DEFAULT_CHARACTER_HEIGHT_RATIO)
        * scale;
    let anchor = resolve_character_anchor(position);
    let x = resolve_axis_position(
        position.x,
        position.x_percent,
        layout.logical_width,
        layout.safe_area.x + layout.safe_area.width / 2.0,
    );
    let y = resolve_axis_position(
        position.y,
        position.y_percent,
        layout.logical_height,
        layout.safe_area.y + layout.safe_area.height / 2.0,
    );
    let left = match anchor {
        CharacterAnchor::Left => x,
        CharacterAnchor::Center => x - width / 2.0,
        CharacterAnchor::Right => x - width,
    };

    LogicalRect {
        x: left,
        y: y - height / 2.0,
        width,
        height,
    }
}

fn resolve_axis_position(
    absolute: Option<f64>,
    percent: Option<f64>,
    logical_length: f64,
    fallback: f64,
) -> f64 {
    if let Some(percent) = percent.filter(|value| value.is_finite()) {
        return logical_length * percent / 100.0;
    }

    absolute
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}
