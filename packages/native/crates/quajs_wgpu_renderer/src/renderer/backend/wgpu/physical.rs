use crate::render_graph::{LogicalRect, RenderViewport};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WgpuPhysicalRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl WgpuPhysicalRect {
    pub fn is_empty(self) -> bool {
        self.width == 0 || self.height == 0
    }
}

pub fn physical_viewport_rect(viewport: &RenderViewport) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x: floor_to_u32(viewport.viewport_x * viewport.device_pixel_ratio),
        y: floor_to_u32(viewport.viewport_y * viewport.device_pixel_ratio),
        width: ceil_to_u32(viewport.physical_viewport_width),
        height: ceil_to_u32(viewport.physical_viewport_height),
    }
}

pub fn physical_scissor_rect(
    viewport: &RenderViewport,
    logical_rect: LogicalRect,
) -> WgpuPhysicalRect {
    physical_rect_clipped_to_viewport(viewport, logical_rect)
}

pub fn physical_draw_rect(
    viewport: &RenderViewport,
    logical_rect: LogicalRect,
) -> WgpuPhysicalRect {
    physical_rect_clipped_to_viewport(viewport, logical_rect)
}

fn physical_rect_clipped_to_viewport(
    viewport: &RenderViewport,
    logical_rect: LogicalRect,
) -> WgpuPhysicalRect {
    if logical_rect.width <= 0.0 || logical_rect.height <= 0.0 {
        return WgpuPhysicalRect::default();
    }

    let viewport_left = viewport.viewport_x * viewport.device_pixel_ratio;
    let viewport_top = viewport.viewport_y * viewport.device_pixel_ratio;
    let viewport_right = viewport_left + viewport.physical_viewport_width;
    let viewport_bottom = viewport_top + viewport.physical_viewport_height;

    let rect_left =
        (viewport.viewport_x + logical_rect.x * viewport.scale) * viewport.device_pixel_ratio;
    let rect_top =
        (viewport.viewport_y + logical_rect.y * viewport.scale) * viewport.device_pixel_ratio;
    let rect_right = rect_left + logical_rect.width * viewport.physical_scale;
    let rect_bottom = rect_top + logical_rect.height * viewport.physical_scale;

    let left = rect_left.max(viewport_left);
    let top = rect_top.max(viewport_top);
    let right = rect_right.min(viewport_right);
    let bottom = rect_bottom.min(viewport_bottom);

    if right <= left || bottom <= top {
        return WgpuPhysicalRect {
            x: floor_to_u32(left),
            y: floor_to_u32(top),
            width: 0,
            height: 0,
        };
    }

    WgpuPhysicalRect {
        x: floor_to_u32(left),
        y: floor_to_u32(top),
        width: ceil_span_to_u32(left, right),
        height: ceil_span_to_u32(top, bottom),
    }
}

fn floor_to_u32(value: f64) -> u32 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }

    value.floor().min(u32::MAX as f64) as u32
}

fn ceil_to_u32(value: f64) -> u32 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }

    value.ceil().min(u32::MAX as f64) as u32
}

fn ceil_span_to_u32(start: f64, end: f64) -> u32 {
    if !start.is_finite() || !end.is_finite() || end <= start {
        return 0;
    }

    (end.ceil() - start.floor()).min(u32::MAX as f64) as u32
}

#[cfg(test)]
mod tests;
