use super::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderBackendConfig {
    pub adapter_name: Option<String>,
    pub surface_format: Option<String>,
    pub present_mode: WgpuPresentMode,
}

impl Default for WgpuNativeRenderBackendConfig {
    fn default() -> Self {
        Self {
            adapter_name: None,
            surface_format: None,
            present_mode: WgpuPresentMode::Fifo,
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
}

impl WgpuNativeRenderBackend {
    pub fn new(config: WgpuNativeRenderBackendConfig) -> Self {
        Self {
            config,
            submissions: Vec::new(),
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
            last_submission: self.submissions.last().cloned(),
            note: "wgpu-backend feature is enabled, but the real wgpu device/surface bridge is not attached yet."
                .to_string(),
        }
    }
}

impl NativeRenderBackend for WgpuNativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderBackendDiagnostics {
    pub feature_enabled: bool,
    pub device_attached: bool,
    pub submitted_frames: usize,
    pub last_submission: Option<NativeRenderSubmission>,
    pub note: String,
}

#[cfg(test)]
mod tests;
