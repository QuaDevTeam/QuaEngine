use super::{vertex, FloatRect, WgpuNativeRenderBufferVertex};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

pub(in crate::renderer::backend::wgpu::buffer) fn rect_vertices(
    rect: FloatRect,
    uv_rect: FloatRect,
    color: [f32; 4],
) -> Vec<WgpuNativeRenderBufferVertex> {
    let points = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x + rect.width, rect.y + rect.height],
        [rect.x, rect.y + rect.height],
    ];
    points
        .into_iter()
        .map(|point| vertex(point, uv_rect, color))
        .collect()
}

pub(in crate::renderer::backend::wgpu::buffer) fn physical_rect_from_float(
    rect: FloatRect,
) -> WgpuPhysicalRect {
    let left = rect.x.floor().max(0.0);
    let top = rect.y.floor().max(0.0);
    let right = (rect.x + rect.width).ceil().max(left);
    let bottom = (rect.y + rect.height).ceil().max(top);

    WgpuPhysicalRect {
        x: left as u32,
        y: top as u32,
        width: (right - left) as u32,
        height: (bottom - top) as u32,
    }
}

pub(in crate::renderer::backend::wgpu::buffer) fn union_physical_rect(
    left: WgpuPhysicalRect,
    right: WgpuPhysicalRect,
) -> WgpuPhysicalRect {
    let x = left.x.min(right.x);
    let y = left.y.min(right.y);
    let right_edge = left
        .x
        .saturating_add(left.width)
        .max(right.x.saturating_add(right.width));
    let bottom_edge = left
        .y
        .saturating_add(left.height)
        .max(right.y.saturating_add(right.height));

    WgpuPhysicalRect {
        x,
        y,
        width: right_edge.saturating_sub(x),
        height: bottom_edge.saturating_sub(y),
    }
}
