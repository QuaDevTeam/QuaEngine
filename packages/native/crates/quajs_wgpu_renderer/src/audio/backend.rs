use std::fmt::{Display, Formatter};

use super::commands::{AudioBackendCommandPlan, AudioBackendTrackStateMap};
use crate::resources::ResourceId;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioBackendAssetLoad {
    pub track_id: String,
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub package_id: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeAudioBackendErrorKind {
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeAudioBackendError {
    pub kind: NativeAudioBackendErrorKind,
    pub message: String,
}

impl NativeAudioBackendError {
    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeAudioBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

impl Display for NativeAudioBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for NativeAudioBackendError {}

pub type NativeAudioBackendResult = Result<(), NativeAudioBackendError>;

pub trait NativeAudioBackend {
    fn wants_audio_asset_loads(&self) -> bool {
        false
    }

    fn apply_audio_asset_loads(
        &mut self,
        _loads: &[AudioBackendAssetLoad],
    ) -> NativeAudioBackendResult {
        Ok(())
    }

    fn apply_audio_commands(&mut self, plan: &AudioBackendCommandPlan) -> NativeAudioBackendResult;
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeAudioBackend {
    loaded_assets: Vec<AudioBackendAssetLoad>,
    applied_plans: Vec<AudioBackendCommandPlan>,
    active_tracks: AudioBackendTrackStateMap,
}

impl NullNativeAudioBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn applied_plans(&self) -> &[AudioBackendCommandPlan] {
        &self.applied_plans
    }

    pub fn loaded_assets(&self) -> &[AudioBackendAssetLoad] {
        &self.loaded_assets
    }

    pub fn active_tracks(&self) -> &AudioBackendTrackStateMap {
        &self.active_tracks
    }

    pub fn diagnostics(&self) -> NullNativeAudioBackendDiagnostics {
        NullNativeAudioBackendDiagnostics {
            loaded_asset_count: self.loaded_assets.len(),
            applied_plan_count: self.applied_plans.len(),
            applied_command_count: self
                .applied_plans
                .iter()
                .map(|plan| plan.commands.len())
                .sum(),
            active_track_count: self.active_tracks.len(),
            last_plan: self.applied_plans.last().cloned(),
        }
    }
}

impl NativeAudioBackend for NullNativeAudioBackend {
    fn apply_audio_asset_loads(
        &mut self,
        loads: &[AudioBackendAssetLoad],
    ) -> NativeAudioBackendResult {
        self.loaded_assets.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_audio_commands(&mut self, plan: &AudioBackendCommandPlan) -> NativeAudioBackendResult {
        self.active_tracks = plan.next_tracks.clone();
        self.applied_plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeAudioBackendDiagnostics {
    pub loaded_asset_count: usize,
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_track_count: usize,
    pub last_plan: Option<AudioBackendCommandPlan>,
}

#[cfg(test)]
mod tests;
