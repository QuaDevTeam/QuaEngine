use std::fmt::{Display, Formatter};

use super::commands::{VideoBackendCommandPlan, VideoBackendStreamStateMap};
use crate::resources::ResourceId;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VideoBackendAssetLoad {
    pub stream_id: String,
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub package_id: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeVideoBackendErrorKind {
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeVideoBackendError {
    pub kind: NativeVideoBackendErrorKind,
    pub message: String,
}

impl NativeVideoBackendError {
    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeVideoBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

impl Display for NativeVideoBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for NativeVideoBackendError {}

pub type NativeVideoBackendResult = Result<(), NativeVideoBackendError>;

pub trait NativeVideoBackend {
    fn wants_video_asset_loads(&self) -> bool {
        false
    }

    fn apply_video_asset_loads(
        &mut self,
        _loads: &[VideoBackendAssetLoad],
    ) -> NativeVideoBackendResult {
        Ok(())
    }

    fn apply_video_commands(&mut self, plan: &VideoBackendCommandPlan) -> NativeVideoBackendResult;
}

impl NativeVideoBackend for () {
    fn apply_video_commands(
        &mut self,
        _plan: &VideoBackendCommandPlan,
    ) -> NativeVideoBackendResult {
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeVideoBackend {
    loaded_assets: Vec<VideoBackendAssetLoad>,
    applied_plans: Vec<VideoBackendCommandPlan>,
    active_streams: VideoBackendStreamStateMap,
}

impl NullNativeVideoBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn applied_plans(&self) -> &[VideoBackendCommandPlan] {
        &self.applied_plans
    }

    pub fn loaded_assets(&self) -> &[VideoBackendAssetLoad] {
        &self.loaded_assets
    }

    pub fn active_streams(&self) -> &VideoBackendStreamStateMap {
        &self.active_streams
    }

    pub fn diagnostics(&self) -> NullNativeVideoBackendDiagnostics {
        NullNativeVideoBackendDiagnostics {
            loaded_asset_count: self.loaded_assets.len(),
            applied_plan_count: self.applied_plans.len(),
            applied_command_count: self
                .applied_plans
                .iter()
                .map(|plan| plan.commands.len())
                .sum(),
            active_stream_count: self.active_streams.len(),
            last_plan: self.applied_plans.last().cloned(),
        }
    }
}

impl NativeVideoBackend for NullNativeVideoBackend {
    fn apply_video_asset_loads(
        &mut self,
        loads: &[VideoBackendAssetLoad],
    ) -> NativeVideoBackendResult {
        self.loaded_assets.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_video_commands(&mut self, plan: &VideoBackendCommandPlan) -> NativeVideoBackendResult {
        self.active_streams = plan.next_streams.clone();
        self.applied_plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeVideoBackendDiagnostics {
    pub loaded_asset_count: usize,
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_stream_count: usize,
    pub last_plan: Option<VideoBackendCommandPlan>,
}

#[cfg(test)]
mod tests;
