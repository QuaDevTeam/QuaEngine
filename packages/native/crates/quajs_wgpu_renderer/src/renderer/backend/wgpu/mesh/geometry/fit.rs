use crate::render_graph::{LogicalRect, MediaFit, MediaOrigin};

use super::super::super::primitive::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};
use super::types::WgpuFloatRect;
use super::uv::normalized_source_uv_rect;

pub(super) fn media_vertex_rect(primitive: &WgpuNativeRenderPrimitive) -> WgpuFloatRect {
    let base = WgpuFloatRect::from(primitive.physical_bounds);
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Image {
            fit,
            origin,
            source,
            ..
        }
        | WgpuNativeRenderPrimitiveKind::VideoFallback {
            fit,
            origin,
            source,
            ..
        } => fit_media_rect(base, primitive.logical_bounds, *source, *fit, *origin).unwrap_or(base),
        _ => base,
    }
}

fn fit_media_rect(
    base: WgpuFloatRect,
    target: LogicalRect,
    source: LogicalRect,
    fit: MediaFit,
    origin: MediaOrigin,
) -> Option<WgpuFloatRect> {
    if fit == MediaFit::Fill {
        return Some(base);
    }
    if base.width <= 0.0
        || base.height <= 0.0
        || !target.width.is_finite()
        || !target.height.is_finite()
        || target.width <= 0.0
        || target.height <= 0.0
    {
        return None;
    }

    let (source_width, source_height) = media_source_dimensions(target, source)?;
    let contain_scale = (target.width / source_width).min(target.height / source_height);
    let cover_scale = (target.width / source_width).max(target.height / source_height);
    let scale = match fit {
        MediaFit::Cover => cover_scale,
        MediaFit::Contain => contain_scale,
        MediaFit::None => 1.0,
        MediaFit::ScaleDown => contain_scale.min(1.0),
        MediaFit::Fill => 1.0,
    };
    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }

    let fitted_width = source_width * scale;
    let fitted_height = source_height * scale;
    let origin_x = media_origin_component(origin.x);
    let origin_y = media_origin_component(origin.y);
    let logical_x = target.x + (target.width - fitted_width) * origin_x;
    let logical_y = target.y + (target.height - fitted_height) * origin_y;
    let scale_x = f64::from(base.width) / target.width;
    let scale_y = f64::from(base.height) / target.height;

    Some(WgpuFloatRect {
        x: (f64::from(base.x) + (logical_x - target.x) * scale_x) as f32,
        y: (f64::from(base.y) + (logical_y - target.y) * scale_y) as f32,
        width: (fitted_width * scale_x) as f32,
        height: (fitted_height * scale_y) as f32,
    })
}

fn media_source_dimensions(target: LogicalRect, source: LogicalRect) -> Option<(f64, f64)> {
    let source_is_logical = source.width.is_finite()
        && source.height.is_finite()
        && source.width > 0.0
        && source.height > 0.0
        && normalized_source_uv_rect(source).is_none();
    let (width, height) = if source_is_logical {
        (source.width, source.height)
    } else {
        (target.width, target.height)
    };

    if width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0 {
        Some((width, height))
    } else {
        None
    }
}

fn media_origin_component(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.5
    }
}
