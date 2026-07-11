use crate::render_graph::LogicalRect;
use crate::stage_layout::ResolvedStageLayout;

const MAX_PANEL_WIDTH: f64 = 620.0;
const BUTTON_HEIGHT: f64 = 46.0;
const BUTTON_GAP: f64 = 9.0;

pub fn choices_panel_bounds(layout: &ResolvedStageLayout, choice_count: usize) -> LogicalRect {
    choices_panel_bounds_with_bottom(
        layout,
        choice_count,
        layout.safe_area.y + layout.safe_area.height - layout.logical_height * 0.05,
    )
}

pub fn choices_panel_bounds_with_bottom(
    layout: &ResolvedStageLayout,
    choice_count: usize,
    bottom: f64,
) -> LogicalRect {
    let safe = layout.safe_area;
    let width = safe.width.min(MAX_PANEL_WIDTH);
    let count = choice_count.max(1) as f64;
    let height = count * BUTTON_HEIGHT + (count - 1.0) * BUTTON_GAP;
    LogicalRect {
        x: safe.x + safe.width - width - safe.width * 0.05,
        y: (bottom - height).max(safe.y),
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
