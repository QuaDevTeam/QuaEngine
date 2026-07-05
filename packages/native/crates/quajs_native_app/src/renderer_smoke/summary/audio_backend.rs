use serde::Serialize;

use quajs_wgpu_renderer::audio::NullNativeAudioBackend;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererSmokeAudioBackendSummary {
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_track_count: usize,
}

impl NativeRendererSmokeAudioBackendSummary {
    pub fn from_null_backend(backend: Option<&NullNativeAudioBackend>) -> Self {
        let Some(backend) = backend else {
            return Self::default();
        };
        let diagnostics = backend.diagnostics();
        Self {
            applied_plan_count: diagnostics.applied_plan_count,
            applied_command_count: diagnostics.applied_command_count,
            active_track_count: diagnostics.active_track_count,
        }
    }
}
