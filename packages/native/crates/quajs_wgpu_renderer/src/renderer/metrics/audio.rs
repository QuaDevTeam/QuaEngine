use crate::audio::AudioBackendTrackStateMap;

use super::NativeRendererAudioBackendMetrics;

pub(super) fn audio_backend_metrics(
    tracks: &AudioBackendTrackStateMap,
) -> NativeRendererAudioBackendMetrics {
    let mut metrics = NativeRendererAudioBackendMetrics {
        active_track_count: tracks.len(),
        ..Default::default()
    };

    for track in tracks.values() {
        for package_id in &track.package_candidates {
            *metrics
                .active_track_count_by_package
                .entry(package_id.clone())
                .or_default() += 1;
        }
    }

    metrics
}
