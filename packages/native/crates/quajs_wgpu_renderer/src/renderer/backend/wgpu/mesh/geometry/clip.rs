use super::super::super::physical::WgpuPhysicalRect;
use super::super::super::primitive::WgpuNativeRenderPrimitive;
use super::types::WgpuFloatRect;

pub(super) fn media_scissor(
    primitive: &WgpuNativeRenderPrimitive,
    vertex_rect: WgpuFloatRect,
) -> Option<WgpuPhysicalRect> {
    if media_rect_exceeds_bounds(vertex_rect, primitive.physical_bounds) {
        return Some(match primitive.scissor {
            Some(scissor) => intersect_physical_rect(scissor, primitive.physical_bounds),
            None => primitive.physical_bounds,
        });
    }

    primitive.scissor
}

fn media_rect_exceeds_bounds(rect: WgpuFloatRect, bounds: WgpuPhysicalRect) -> bool {
    let bounds_left = bounds.x as f32;
    let bounds_top = bounds.y as f32;
    let bounds_right = bounds_left + bounds.width as f32;
    let bounds_bottom = bounds_top + bounds.height as f32;
    let rect_right = rect.x + rect.width;
    let rect_bottom = rect.y + rect.height;
    let epsilon = 0.0001;

    rect.x < bounds_left - epsilon
        || rect.y < bounds_top - epsilon
        || rect_right > bounds_right + epsilon
        || rect_bottom > bounds_bottom + epsilon
}

fn intersect_physical_rect(a: WgpuPhysicalRect, b: WgpuPhysicalRect) -> WgpuPhysicalRect {
    let left = u64::from(a.x).max(u64::from(b.x));
    let top = u64::from(a.y).max(u64::from(b.y));
    let right = u64::from(a.x)
        .saturating_add(u64::from(a.width))
        .min(u64::from(b.x).saturating_add(u64::from(b.width)));
    let bottom = u64::from(a.y)
        .saturating_add(u64::from(a.height))
        .min(u64::from(b.y).saturating_add(u64::from(b.height)));

    WgpuPhysicalRect {
        x: left as u32,
        y: top as u32,
        width: right.saturating_sub(left) as u32,
        height: bottom.saturating_sub(top) as u32,
    }
}
