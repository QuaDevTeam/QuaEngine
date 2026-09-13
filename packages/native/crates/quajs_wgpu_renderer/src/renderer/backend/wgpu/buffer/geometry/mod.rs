mod rect;
mod rounded;

use super::WgpuNativeRenderBufferVertex;
use crate::render_graph::EdgeInsetsDrawParam;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

pub(super) use rect::{physical_rect_from_float, rect_vertices, union_physical_rect};
pub(super) use rounded::{rounded_border_geometry, rounded_rect_geometry_with_uv_bounds};

#[derive(Clone, Debug, PartialEq)]
pub(super) struct WgpuNativeRenderBufferGeometry {
    pub physical_bounds: WgpuPhysicalRect,
    pub vertices: Vec<WgpuNativeRenderBufferVertex>,
    pub indices: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct FloatRect {
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) width: f32,
    pub(super) height: f32,
}

impl FloatRect {
    pub(super) fn from_physical(rect: WgpuPhysicalRect) -> Option<Self> {
        if rect.width == 0 || rect.height == 0 {
            return None;
        }

        Some(Self {
            x: rect.x as f32,
            y: rect.y as f32,
            width: rect.width as f32,
            height: rect.height as f32,
        })
    }

    fn inset(self, amount: f32) -> Option<Self> {
        let amount = amount.max(0.0);
        let width = self.width - amount * 2.0;
        let height = self.height - amount * 2.0;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }

        Some(Self {
            x: self.x + amount,
            y: self.y + amount,
            width,
            height,
        })
    }

    pub(super) fn inset_edges(self, padding: EdgeInsetsDrawParam) -> Option<Self> {
        let left = (padding.left as f32).max(0.0);
        let right = (padding.right as f32).max(0.0);
        let top = (padding.top as f32).max(0.0);
        let bottom = (padding.bottom as f32).max(0.0);
        let width = self.width - left - right;
        let height = self.height - top - bottom;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }

        Some(Self {
            x: self.x + left,
            y: self.y + top,
            width,
            height,
        })
    }

    pub(super) fn right(self) -> f32 {
        self.x + self.width
    }
}

fn vertex(point: [f32; 2], rect: FloatRect, color: [f32; 4]) -> WgpuNativeRenderBufferVertex {
    vertex_with_uv_bounds(point, rect, color, [0.0, 0.0], [1.0, 1.0])
}

fn vertex_with_uv_bounds(
    point: [f32; 2],
    rect: FloatRect,
    color: [f32; 4],
    uv_top_left: [f32; 2],
    uv_bottom_right: [f32; 2],
) -> WgpuNativeRenderBufferVertex {
    let u = ((point[0] - rect.x) / rect.width).clamp(0.0, 1.0);
    let v = ((point[1] - rect.y) / rect.height).clamp(0.0, 1.0);

    WgpuNativeRenderBufferVertex {
        position: point,
        uv: [
            uv_top_left[0] + (uv_bottom_right[0] - uv_top_left[0]) * u,
            uv_top_left[1] + (uv_bottom_right[1] - uv_top_left[1]) * v,
        ],
        color,
        effect0: [0.0; 4],
        effect1: [0.0; 4],
        effect2: [0.0; 4],
    }
}
