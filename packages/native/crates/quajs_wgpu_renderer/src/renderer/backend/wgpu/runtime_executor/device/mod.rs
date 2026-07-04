mod operation;
mod state;

use operation::apply_operation;
pub(in crate::renderer::backend::wgpu::runtime_executor) use state::{
    RuntimeBindGroupState, RuntimeBufferState, RuntimePipelineState, WgpuNativeRenderRuntimeState,
};

use super::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeExecutionReport,
    WgpuNativeRenderRuntimeSnapshot,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
};

pub trait WgpuNativeRenderRuntimeDevice: Clone {
    fn begin_runtime_plan(
        &mut self,
        _plan: &WgpuNativeRenderRuntimePlan,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        Ok(())
    }

    fn apply_runtime_operation(
        &mut self,
        operation: &WgpuNativeRenderRuntimeOperation,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError>;

    fn finish_runtime_plan(&mut self) -> Result<(), WgpuNativeRenderRuntimeError>;

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot;

    fn device_attached(&self) -> bool {
        false
    }

    fn diagnostic_note(&self) -> &'static str {
        "wgpu-backend feature is enabled and records wgpu execution, primitive, mesh, buffer, render pass, pipeline, GPU frame upload, submission, device execution, resource cache, runtime apply plans, and in-memory runtime execution reports; the real device/surface bridge is not attached yet."
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct InMemoryWgpuNativeRenderRuntimeDevice {
    state: WgpuNativeRenderRuntimeState,
}

impl InMemoryWgpuNativeRenderRuntimeDevice {
    pub fn snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.state.snapshot()
    }
}

impl WgpuNativeRenderRuntimeDevice for InMemoryWgpuNativeRenderRuntimeDevice {
    fn apply_runtime_operation(
        &mut self,
        operation: &WgpuNativeRenderRuntimeOperation,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        apply_operation(&mut self.state, report, operation)
    }

    fn finish_runtime_plan(&mut self) -> Result<(), WgpuNativeRenderRuntimeError> {
        super::passes::ensure_no_open_encoder_or_pass(&self.state)
    }

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.snapshot()
    }
}
