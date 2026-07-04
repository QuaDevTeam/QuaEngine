use crate::audio::AudioBackendTrackState;
use crate::projection::audio::{AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState};
use crate::resources::ResourceId;

pub(super) fn audio_track_state(package_id: &str) -> AudioBackendTrackState {
    AudioBackendTrackState {
        id: "bgm-main".to_string(),
        kind: AudioTrackKind::Bgm,
        asset_type: "bgm".to_string(),
        asset_name: "music/opening.ogg".to_string(),
        load_mode: AudioTrackLoadMode::Buffered,
        playback_state: AudioTrackPlaybackState::Playing,
        looped: false,
        volume: 1.0,
        package_candidates: [package_id.to_string()].into_iter().collect(),
        media_resource_id: ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
        handle_resource_id: ResourceId::from("audio:handle:bgm:bgm:bgm-main"),
    }
}
