mod apply;
mod device;
mod draw;
mod passes;
#[cfg(feature = "real-wgpu")]
mod real_device;
mod resources;

use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

use super::runtime_plan::WgpuNativeRenderRuntimePlan;
pub use device::{InMemoryWgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeDevice};
#[cfg(feature = "image-decode")]
pub use real_device::decode_image_bytes_rgba8;
#[cfg(feature = "real-wgpu")]
pub use real_device::{
    create_real_wgpu_surface_target, RealRuntimeFrameTargetSnapshot,
    RealWgpuDecodedTextureMetadata, RealWgpuDecodedTextureRgba8, RealWgpuFrameCopyReport,
    RealWgpuNativeRenderRuntimeDevice, RealWgpuNativeRenderRuntimeTarget,
    RealWgpuSurfacePresentReport, RealWgpuSurfacePresentStatus, RealWgpuSurfaceTargetBootstrap,
    RealWgpuSurfaceTargetBootstrapError, RealWgpuSurfaceTargetBootstrapErrorKind,
    RealWgpuSurfaceTargetBootstrapRequest, RealWgpuTargetResizeReport,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuNativeRenderRuntimeErrorKind {
    MissingBuffer,
    MissingPipeline,
    MissingBindGroup,
    InvalidOperationOrder,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderRuntimeError {
    pub kind: WgpuNativeRenderRuntimeErrorKind,
    pub message: String,
}

impl WgpuNativeRenderRuntimeError {
    fn new(kind: WgpuNativeRenderRuntimeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl Display for WgpuNativeRenderRuntimeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for WgpuNativeRenderRuntimeError {}

pub type WgpuNativeRenderRuntimeResult =
    Result<WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeError>;

pub trait WgpuNativeRenderRuntimeExecutor {
    fn apply_runtime_plan(
        &mut self,
        plan: &WgpuNativeRenderRuntimePlan,
    ) -> WgpuNativeRenderRuntimeResult;

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot;

    fn device_attached(&self) -> bool {
        false
    }

    fn diagnostic_note(&self) -> &'static str {
        "wgpu-backend feature is enabled and records wgpu execution, primitive, mesh, buffer, render pass, pipeline, GPU frame upload, submission, device execution, resource cache, runtime apply plans, and in-memory runtime execution reports; the real device/surface bridge is not attached yet."
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct InMemoryWgpuNativeRenderRuntimeExecutor<D = InMemoryWgpuNativeRenderRuntimeDevice>
where
    D: WgpuNativeRenderRuntimeDevice,
{
    device: D,
    applied_reports: Vec<WgpuNativeRenderRuntimeExecutionReport>,
}

impl InMemoryWgpuNativeRenderRuntimeExecutor<InMemoryWgpuNativeRenderRuntimeDevice> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<D> InMemoryWgpuNativeRenderRuntimeExecutor<D>
where
    D: WgpuNativeRenderRuntimeDevice,
{
    pub fn with_device(device: D) -> Self {
        Self {
            device,
            applied_reports: Vec::new(),
        }
    }

    pub fn device(&self) -> &D {
        &self.device
    }

    pub fn device_mut(&mut self) -> &mut D {
        &mut self.device
    }

    pub fn snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.device.runtime_snapshot()
    }

    pub fn applied_reports(&self) -> &[WgpuNativeRenderRuntimeExecutionReport] {
        &self.applied_reports
    }

    pub fn last_report(&self) -> Option<&WgpuNativeRenderRuntimeExecutionReport> {
        self.applied_reports.last()
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderRuntimeSnapshot {
    pub resident_buffer_count: usize,
    pub resident_buffer_byte_len: usize,
    pub resident_pipeline_count: usize,
    pub resident_bind_group_count: usize,
    pub resident_texture_count: usize,
    pub resident_texture_byte_len: usize,
    pub resident_texture_resource_ids: Vec<String>,
    pub resident_texture_byte_len_by_package:
        BTreeMap<String, WgpuNativeRenderRuntimeTexturePackageMemory>,
    pub texture_sampler_diagnostics: WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
    pub submitted_command_buffer_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderRuntimeTexturePackageMemory {
    pub owned_count: usize,
    pub dependent_count: usize,
    pub owned_byte_len: usize,
    pub dependent_byte_len: usize,
}

impl WgpuNativeRenderRuntimeTexturePackageMemory {
    #[cfg(feature = "real-wgpu")]
    pub(crate) fn add_owned(&mut self, byte_len: usize) {
        self.owned_count = self.owned_count.saturating_add(1);
        self.owned_byte_len = self.owned_byte_len.saturating_add(byte_len);
    }

    #[cfg(feature = "real-wgpu")]
    pub(crate) fn add_dependent(&mut self, byte_len: usize) {
        self.dependent_count = self.dependent_count.saturating_add(1);
        self.dependent_byte_len = self.dependent_byte_len.saturating_add(byte_len);
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderRuntimeTextureSamplerDiagnostics {
    pub decoded_bind_group_count: usize,
    pub placeholder_bind_group_count: usize,
    pub decoded_resource_ids_by_bind_group: BTreeMap<String, String>,
    pub placeholder_resource_ids_by_bind_group: BTreeMap<String, Vec<String>>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderRuntimeExecutionReport {
    pub revision: u64,
    pub operation_count: usize,
    pub applied_operation_count: usize,
    pub cache_operation_count: usize,
    pub release_operation_count: usize,
    pub queue_write_count: usize,
    pub queue_write_byte_len: usize,
    pub encoder_count: usize,
    pub render_pass_count: usize,
    pub draw_indexed_count: usize,
    pub skipped_draw_count: usize,
    pub skipped_draws_by_reason: BTreeMap<String, usize>,
    pub missing_resource_references_by_resource_id: BTreeMap<String, usize>,
    pub skipped_draws_by_owner_package: BTreeMap<String, usize>,
    pub skipped_draws_by_required_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_owner_package: BTreeMap<String, usize>,
    pub missing_resource_references_by_required_package: BTreeMap<String, usize>,
    pub submit_count: usize,
    pub buffer_create_count: usize,
    pub buffer_reuse_count: usize,
    pub buffer_recreate_count: usize,
    pub buffer_release_count: usize,
    pub pipeline_create_count: usize,
    pub pipeline_reuse_count: usize,
    pub pipeline_recreate_count: usize,
    pub pipeline_release_count: usize,
    pub bind_group_create_count: usize,
    pub bind_group_reuse_count: usize,
    pub bind_group_recreate_count: usize,
    pub bind_group_release_count: usize,
    pub resident_buffer_count: usize,
    pub resident_buffer_byte_len: usize,
    pub resident_pipeline_count: usize,
    pub resident_bind_group_count: usize,
    pub resident_texture_count: usize,
    pub resident_texture_byte_len: usize,
    pub resident_texture_resource_ids: Vec<String>,
    pub resident_texture_byte_len_by_package:
        BTreeMap<String, WgpuNativeRenderRuntimeTexturePackageMemory>,
    pub texture_sampler_diagnostics: WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
    pub submitted_command_buffer_count: usize,
}

#[cfg(test)]
mod tests;
