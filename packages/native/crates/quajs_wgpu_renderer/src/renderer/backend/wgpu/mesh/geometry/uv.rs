use crate::render_graph::LogicalRect;

use super::super::super::primitive::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};
use super::types::WgpuNativeRenderUvRect;

pub(super) fn texture_uv_rect(primitive: &WgpuNativeRenderPrimitive) -> WgpuNativeRenderUvRect {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Image { source, .. }
        | WgpuNativeRenderPrimitiveKind::VideoFallback { source, .. } => {
            normalized_source_uv_rect(*source).unwrap_or_default()
        }
        _ => WgpuNativeRenderUvRect::default(),
    }
}

pub(super) fn normalized_source_uv_rect(source: LogicalRect) -> Option<WgpuNativeRenderUvRect> {
    if !source.x.is_finite()
        || !source.y.is_finite()
        || !source.width.is_finite()
        || !source.height.is_finite()
        || source.width <= 0.0
        || source.height <= 0.0
    {
        return None;
    }

    let max_u = source.x + source.width;
    let max_v = source.y + source.height;
    let is_normalized = source.x >= 0.0 && source.y >= 0.0 && max_u <= 1.0 && max_v <= 1.0;
    if !is_normalized {
        return None;
    }

    Some(WgpuNativeRenderUvRect {
        min_u: source.x as f32,
        min_v: source.y as f32,
        max_u: max_u as f32,
        max_v: max_v as f32,
    })
}
