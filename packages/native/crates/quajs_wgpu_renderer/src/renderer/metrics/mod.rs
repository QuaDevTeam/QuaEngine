use crate::audio::AudioBackendTrackStateMap;
use crate::frame::PreparedNativeFrame;
use crate::resources::NativeResourceLedger;

mod audio;
mod frame;
mod resources;
mod types;

pub use types::{
    NativeRendererAudioBackendMetrics, NativeRendererAudioResourceMetrics,
    NativeRendererFrameAssetMetrics, NativeRendererFrameMetrics, NativeRendererMetrics,
    NativeRendererResourceMetrics,
};

impl NativeRendererMetrics {
    pub fn from_state(
        revision: u64,
        frame: Option<&PreparedNativeFrame>,
        resources: &NativeResourceLedger,
    ) -> Self {
        Self::from_state_with_audio_backend(
            revision,
            frame,
            resources,
            &AudioBackendTrackStateMap::new(),
        )
    }

    pub fn from_state_with_audio_backend(
        revision: u64,
        frame: Option<&PreparedNativeFrame>,
        resources: &NativeResourceLedger,
        audio_backend_tracks: &AudioBackendTrackStateMap,
    ) -> Self {
        Self {
            revision,
            has_frame: frame.is_some(),
            frame: frame.map(frame::frame_metrics).unwrap_or_default(),
            resources: resources::resource_metrics(resources),
            audio_backend: audio::audio_backend_metrics(audio_backend_tracks),
        }
    }
}

#[cfg(test)]
mod tests;
