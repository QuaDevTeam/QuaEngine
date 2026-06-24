use super::submission::NativeRenderFallbackWarningTracker;
use super::{
    NativeRenderBackend, NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderBackendResult, NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef,
    NativeRenderSubmission,
};

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

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderBackend {
    config: WgpuNativeRenderBackendConfig,
    submissions: Vec<NativeRenderSubmission>,
    fallback_warnings: NativeRenderFallbackWarningTracker,
}

impl WgpuNativeRenderBackend {
    pub fn new(config: WgpuNativeRenderBackendConfig) -> Self {
        Self {
            config,
            submissions: Vec::new(),
            fallback_warnings: NativeRenderFallbackWarningTracker::default(),
        }
    }

    pub fn config(&self) -> &WgpuNativeRenderBackendConfig {
        &self.config
    }

    pub fn submissions(&self) -> &[NativeRenderSubmission] {
        &self.submissions
    }

    pub fn diagnostics(&self) -> WgpuNativeRenderBackendDiagnostics {
        WgpuNativeRenderBackendDiagnostics {
            feature_enabled: true,
            device_attached: false,
            submitted_frames: self.submissions.len(),
            resources: NativeRenderBackendResourceDiagnostics::from_submissions(&self.submissions),
            fallback_warnings: self.fallback_warnings.diagnostics(),
            last_submission: self.submissions.last().cloned(),
            note: "wgpu-backend feature is enabled, but the real wgpu device/surface bridge is not attached yet."
                .to_string(),
        }
    }
}

impl NativeRenderBackend for WgpuNativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.config
            .resource_policy
            .validate_submission(&submission)?;
        self.fallback_warnings
            .record_submission(&submission.fallback_diagnostics);
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderBackendDiagnostics {
    pub feature_enabled: bool,
    pub device_attached: bool,
    pub submitted_frames: usize,
    pub resources: NativeRenderBackendResourceDiagnostics,
    pub fallback_warnings: NativeRenderFallbackWarningDiagnostics,
    pub last_submission: Option<NativeRenderSubmission>,
    pub note: String,
}

#[cfg(test)]
mod tests;
