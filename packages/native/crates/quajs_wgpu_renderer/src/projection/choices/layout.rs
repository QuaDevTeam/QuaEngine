use crate::render_graph::LogicalRect;
use crate::stage_layout::ResolvedStageLayout;

const MAX_PANEL_WIDTH: f64 = 1040.0;
const BUTTON_HEIGHT: f64 = 84.0;
const BUTTON_GAP: f64 = 18.0;

pub fn choices_panel_bounds(layout: &ResolvedStageLayout, choice_count: usize) -> LogicalRect {
    let safe = layout.safe_area;
    let width = safe.width.min(MAX_PANEL_WIDTH);
    let count = choice_count.max(1) as f64;
    let height = count * BUTTON_HEIGHT + (count - 1.0) * BUTTON_GAP;
    LogicalRect {
        x: safe.x + (safe.width - width) / 2.0,
        y: safe.y + safe.height - height - layout.logical_height * 0.08,
        width,
        height,
    }
}

pub fn choice_button_bounds(panel: LogicalRect, index: usize) -> LogicalRect {
    let y = panel.y + index as f64 * (BUTTON_HEIGHT + BUTTON_GAP);
    LogicalRect {
        x: panel.x,
        y,
        width: panel.width,
        height: BUTTON_HEIGHT,
    }
}
