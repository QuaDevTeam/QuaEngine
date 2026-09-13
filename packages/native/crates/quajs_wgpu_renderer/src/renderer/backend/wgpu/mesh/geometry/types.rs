use super::super::super::physical::WgpuPhysicalRect;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WgpuNativeRenderUvRect {
    pub min_u: f32,
    pub min_v: f32,
    pub max_u: f32,
    pub max_v: f32,
}

impl Default for WgpuNativeRenderUvRect {
    fn default() -> Self {
        Self {
            min_u: 0.0,
            min_v: 0.0,
            max_u: 1.0,
            max_v: 1.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WgpuFloatRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl From<WgpuPhysicalRect> for WgpuFloatRect {
    fn from(rect: WgpuPhysicalRect) -> Self {
        Self {
            x: rect.x as f32,
            y: rect.y as f32,
            width: rect.width as f32,
            height: rect.height as f32,
        }
    }
}
