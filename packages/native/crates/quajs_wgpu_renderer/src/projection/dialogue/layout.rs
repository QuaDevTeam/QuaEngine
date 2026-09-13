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

/// Matches the Web dialogue box `min-height` behaviour: the panel keeps the
/// base height for short lines but grows upward (bottom edge stays anchored)
/// when the wrapped text needs more room, instead of clipping the overflow.
pub fn dialogue_panel_bounds_for_lines(
    layout: &ResolvedStageLayout,
    text_lines: usize,
    has_speaker: bool,
    line_height: f64,
) -> LogicalRect {
    let top = if has_speaker { 50.0 } else { 22.0 };
    dialogue_panel_bounds_for_content(layout, top + text_lines.max(1) as f64 * line_height + 18.0)
}

pub fn dialogue_panel_bounds_for_content(layout: &ResolvedStageLayout, needed: f64) -> LogicalRect {
    let base = dialogue_panel_bounds(layout);
    let height = base.height.max(needed);
    LogicalRect {
        y: base.y + base.height - height,
        height,
        ..base
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
        y: panel.y + 22.0,
        width: panel.width.min(320.0),
        // Match the Web speaker element, which hugs one 19.8px line instead of
        // a taller box: native text is Middle-aligned, so the box height sets
        // the glyph center. 22 + 20/2 puts the centre at panel.y + 32, the
        // same spot as the Web speaker's 18px/700 line.
        height: 20.0,
    }
}

pub fn speaker_accent_bounds(panel: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: panel.x + 28.0,
        y: panel.y + 44.0,
        width: 116.0,
        height: 1.0,
    }
}

pub fn text_bounds(panel: LogicalRect, has_speaker: bool) -> LogicalRect {
    let top = if has_speaker { 50.0 } else { 22.0 };
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
