use crate::renderer::backend::wgpu::WgpuNativeRenderBufferRole;

#[derive(Clone, Debug)]
pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) struct RealRuntimeBuffer {
    pub(super) buffer: wgpu::Buffer,
    pub(super) role: WgpuNativeRenderBufferRole,
    pub(super) byte_len: usize,
    pub(super) write_count: usize,
    pub(super) last_checksum: Option<u64>,
}
