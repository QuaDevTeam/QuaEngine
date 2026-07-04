use super::super::mesh::WgpuNativeRenderVertex;
use super::super::physical::WgpuPhysicalRect;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct FloatRect {
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) width: f32,
    pub(super) height: f32,
}

pub(super) fn border_segment_rects(
    bounds: WgpuPhysicalRect,
    width: f32,
) -> [(&'static str, FloatRect); 4] {
    let x = bounds.x as f32;
    let y = bounds.y as f32;
    let quad_width = bounds.width as f32;
    let quad_height = bounds.height as f32;
    let width = width.max(0.0).min(quad_width * 0.5).min(quad_height * 0.5);

    [
        (
            "top",
            FloatRect {
                x,
                y,
                width: quad_width,
                height: width,
            },
        ),
        (
            "right",
            FloatRect {
                x: x + quad_width - width,
                y,
                width,
                height: quad_height,
            },
        ),
        (
            "bottom",
            FloatRect {
                x,
                y: y + quad_height - width,
                width: quad_width,
                height: width,
            },
        ),
        (
            "left",
            FloatRect {
                x,
                y,
                width,
                height: quad_height,
            },
        ),
    ]
}

pub(super) fn vertices_from_float_rect(rect: FloatRect) -> [WgpuNativeRenderVertex; 4] {
    [
        WgpuNativeRenderVertex {
            position: [rect.x, rect.y],
            uv: [0.0, 0.0],
        },
        WgpuNativeRenderVertex {
            position: [rect.x + rect.width, rect.y],
            uv: [1.0, 0.0],
        },
        WgpuNativeRenderVertex {
            position: [rect.x + rect.width, rect.y + rect.height],
            uv: [1.0, 1.0],
        },
        WgpuNativeRenderVertex {
            position: [rect.x, rect.y + rect.height],
            uv: [0.0, 1.0],
        },
    ]
}

pub(super) fn physical_rect_from_float(rect: FloatRect) -> WgpuPhysicalRect {
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
