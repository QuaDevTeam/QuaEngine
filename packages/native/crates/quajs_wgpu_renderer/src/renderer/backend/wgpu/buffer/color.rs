use super::super::mesh::{WgpuNativeRenderColor, WgpuNativeRenderPaintColor};

pub(super) fn color_to_rgba(color: WgpuNativeRenderPaintColor) -> [f32; 4] {
    match color {
        WgpuNativeRenderPaintColor::Rgba(color) => color_struct_to_rgba(color),
        WgpuNativeRenderPaintColor::CurrentColor => {
            color_struct_to_rgba(WgpuNativeRenderColor::WHITE)
        }
    }
}

pub(super) fn color_struct_to_rgba(color: WgpuNativeRenderColor) -> [f32; 4] {
    [
        color.r.clamp(0.0, 1.0),
        color.g.clamp(0.0, 1.0),
        color.b.clamp(0.0, 1.0),
        color.a.clamp(0.0, 1.0),
    ]
}
