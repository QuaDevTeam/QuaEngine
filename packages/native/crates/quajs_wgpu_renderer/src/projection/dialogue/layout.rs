use crate::render_graph::LogicalRect;
use crate::stage_layout::ResolvedStageLayout;

pub fn dialogue_panel_bounds(layout: &ResolvedStageLayout) -> LogicalRect {
    let safe = layout.safe_area;
    let margin_x = safe.width * 0.05;
    let height = layout.logical_height * 0.1225;
    LogicalRect {
        x: safe.x + margin_x,
        y: safe.y + safe.height - height - layout.logical_height * 0.05,
        width: safe.width - margin_x * 2.0,
        height,
    }
}

pub fn dialogue_shadow_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x - 8.0,
        y: panel.y + 10.0,
        width: panel.width + 16.0,
        height: panel.height + 8.0,
    }
}

pub fn dialogue_accent_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x + 18.0,
        y: panel.y,
        width: panel.width - 36.0,
        height: 1.0,
    }
}

pub fn speaker_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x + 28.0,
        y: panel.y + 18.0,
        width: panel.width.min(320.0),
        height: 30.0,
    }
}

pub fn speaker_accent_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x + 28.0,
        y: panel.y + 48.0,
        width: 116.0,
        height: 1.0,
    }
}

pub fn text_bounds(panel: LogicalRect, has_speaker: bool) -> LogicalRect {
    let top = if has_speaker { 58.0 } else { 24.0 };
    LogicalRect {
        x: panel.x + 28.0,
        y: panel.y + top,
        width: panel.width - 56.0,
        height: (panel.height - top - 18.0).max(0.0),
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
