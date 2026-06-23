use crate::render_graph::LogicalRect;
use crate::stage_layout::ResolvedStageLayout;

pub fn dialogue_panel_bounds(layout: &ResolvedStageLayout) -> LogicalRect {
    let safe = layout.safe_area;
    let margin_x = safe.width * 0.04;
    let height = layout.logical_height * 0.24;
    LogicalRect {
        x: safe.x + margin_x,
        y: safe.y + safe.height - height - layout.logical_height * 0.04,
        width: safe.width - margin_x * 2.0,
        height,
    }
}

pub fn speaker_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x + panel.width * 0.055,
        y: panel.y + panel.height * 0.08,
        width: panel.width * 0.42,
        height: panel.height * 0.18,
    }
}

pub fn text_bounds(panel: LogicalRect, has_speaker: bool) -> LogicalRect {
    let top = if has_speaker { 0.29 } else { 0.16 };
    LogicalRect {
        x: panel.x + panel.width * 0.055,
        y: panel.y + panel.height * top,
        width: panel.width * 0.89,
        height: panel.height * (0.86 - top),
    }
}

pub fn avatar_bounds(panel: LogicalRect) -> LogicalRect {
    let size = panel.height * 0.72;
    LogicalRect {
        x: panel.x + panel.width - size - panel.width * 0.045,
        y: panel.y + (panel.height - size) / 2.0,
        width: size,
        height: size,
    }
}
