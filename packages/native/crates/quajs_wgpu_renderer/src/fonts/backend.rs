use std::fmt::{Display, Formatter};

use super::commands::{FontBackendCommandPlan, FontBackendFaceStateMap};
use crate::resources::ResourceId;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontBackendAssetLoad {
    pub face_id: String,
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub package_id: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeFontBackendErrorKind {
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeFontBackendError {
    pub kind: NativeFontBackendErrorKind,
    pub message: String,
}

impl NativeFontBackendError {
    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeFontBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

impl Display for NativeFontBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for NativeFontBackendError {}

pub type NativeFontBackendResult = Result<(), NativeFontBackendError>;

pub trait NativeFontBackend {
    fn wants_font_asset_loads(&self) -> bool {
        false
    }

    fn apply_font_asset_loads(
        &mut self,
        _loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult;
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeFontBackend {
    loaded_assets: Vec<FontBackendAssetLoad>,
    applied_plans: Vec<FontBackendCommandPlan>,
    active_faces: FontBackendFaceStateMap,
}

impl NullNativeFontBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn applied_plans(&self) -> &[FontBackendCommandPlan] {
        &self.applied_plans
    }

    pub fn loaded_assets(&self) -> &[FontBackendAssetLoad] {
        &self.loaded_assets
    }

    pub fn active_faces(&self) -> &FontBackendFaceStateMap {
        &self.active_faces
    }

    pub fn diagnostics(&self) -> NullNativeFontBackendDiagnostics {
        NullNativeFontBackendDiagnostics {
            loaded_asset_count: self.loaded_assets.len(),
            applied_plan_count: self.applied_plans.len(),
            applied_command_count: self
                .applied_plans
                .iter()
                .map(|plan| plan.commands.len())
                .sum(),
            active_face_count: self.active_faces.len(),
            last_plan: self.applied_plans.last().cloned(),
        }
    }
}

impl NativeFontBackend for NullNativeFontBackend {
    fn apply_font_asset_loads(
        &mut self,
        loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        self.loaded_assets.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        self.active_faces = plan.next_faces.clone();
        self.applied_plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeFontBackendDiagnostics {
    pub loaded_asset_count: usize,
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_face_count: usize,
    pub last_plan: Option<FontBackendCommandPlan>,
}
