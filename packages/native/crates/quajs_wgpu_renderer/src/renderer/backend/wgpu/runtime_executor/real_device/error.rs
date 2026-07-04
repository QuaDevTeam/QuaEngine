use super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn invalid_order<T>(
    message: impl Into<String>,
) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        message.into(),
    ))
}
