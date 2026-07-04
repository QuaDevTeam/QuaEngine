use crate::renderer::backend::NativeRenderBackendResourcePolicy;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderBackendConfig {
    pub adapter_name: Option<String>,
    pub surface_format: Option<String>,
    pub present_mode: WgpuPresentMode,
    pub resource_policy: NativeRenderBackendResourcePolicy,
}

impl Default for WgpuNativeRenderBackendConfig {
    fn default() -> Self {
        Self {
            adapter_name: None,
            surface_format: None,
            present_mode: WgpuPresentMode::Fifo,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuPresentMode {
    Fifo,
    Mailbox,
    Immediate,
}
