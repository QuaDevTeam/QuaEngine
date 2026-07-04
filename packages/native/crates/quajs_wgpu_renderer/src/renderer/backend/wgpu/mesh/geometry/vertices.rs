use super::super::super::primitive::{WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveKind};
use super::super::vertex::WgpuNativeRenderVertex;
use super::types::{WgpuFloatRect, WgpuNativeRenderUvRect};

pub(super) fn rotation_degrees(primitive: &WgpuNativeRenderPrimitive) -> f32 {
    let degrees = match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Image {
            rotation_degrees, ..
        }
        | WgpuNativeRenderPrimitiveKind::Character {
            rotation_degrees, ..
        } => *rotation_degrees,
        _ => 0.0,
    };

    if degrees.is_finite() {
        degrees as f32
    } else {
        0.0
    }
}

pub(super) fn quad_vertices(
    rect: WgpuFloatRect,
    uv: WgpuNativeRenderUvRect,
    rotation_degrees: f32,
) -> [WgpuNativeRenderVertex; 4] {
    let x = rect.x;
    let y = rect.y;
    let width = rect.width;
    let height = rect.height;
    let center = [x + width * 0.5, y + height * 0.5];

    let mut vertices = [
        WgpuNativeRenderVertex {
            position: [x, y],
            uv: [uv.min_u, uv.min_v],
        },
        WgpuNativeRenderVertex {
            position: [x + width, y],
            uv: [uv.max_u, uv.min_v],
        },
        WgpuNativeRenderVertex {
            position: [x + width, y + height],
            uv: [uv.max_u, uv.max_v],
        },
        WgpuNativeRenderVertex {
            position: [x, y + height],
            uv: [uv.min_u, uv.max_v],
        },
    ];

    if rotation_degrees != 0.0 {
        let radians = rotation_degrees.to_radians();
        let (sin, cos) = radians.sin_cos();
        for vertex in &mut vertices {
            vertex.position = rotate_position(vertex.position, center, sin, cos);
        }
    }

    vertices
}

fn rotate_position(position: [f32; 2], center: [f32; 2], sin: f32, cos: f32) -> [f32; 2] {
    let dx = position[0] - center[0];
    let dy = position[1] - center[1];

    [
        center[0] + dx * cos - dy * sin,
        center[1] + dx * sin + dy * cos,
    ]
}
