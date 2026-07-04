#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderVertex {
    pub position: [f32; 2],
    pub uv: [f32; 2],
}
